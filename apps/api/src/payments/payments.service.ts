import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { countProducts, requestedPremiumIsEarned, resolveShopState, validateCheckoutAmounts } from './payments.rules';
import { dateInTimezone, startOfDayInTimezone } from '../common/time';
import { appendEvent } from '../queue/event-log';
import { QueueService } from '../queue/queue.service';
import { StripeAdapter } from './stripe.adapter';
import { SquareAdapter } from './square.adapter';
import { ExternalAdapter } from './external.adapter';
import type { PaymentProcessor } from './processor.interface';
import { ProcessorNotConfiguredError } from './processor.interface';
import { CLOSE_SHOP_TASKS, OPEN_SHOP_TASKS, type CheckoutDto, type CloseShopDto, type OpenShopDto, type RefundDto } from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(private readonly queue: QueueService) {}

  private async localDate(locationId: string, now = new Date()) {
    const location = await db().selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
    return dateInTimezone(location.timezone, now);
  }

  async getConfig(locationId: string) {
    const trx = db();
    const config = await trx
      .selectFrom('payment_processor_config')
      .selectAll()
      .where('location_id', '=', locationId)
      .executeTakeFirst();

    if (!config) {
      return { activeProcessor: 'external' as const, mode: 'manual' as const, configured: true, showDiscountAtCheckout: true };
    }

    const processor = this.buildProcessor(config.active_processor, config);

    const browserConfigured = config.active_processor === 'stripe'
      ? Boolean(config.stripe_publishable_key)
      : config.active_processor === 'square'
        ? Boolean(config.square_application_id && config.square_location_id)
        : true;
    return {
      activeProcessor: config.active_processor,
      mode: config.active_processor === 'external' ? 'manual' as const : 'integrated' as const,
      configured: processor.isConfigured() && browserConfigured,
      stripePublishableKey: config.active_processor === 'stripe' ? config.stripe_publishable_key : null,
      stripeConnectedAccountId: config.active_processor === 'stripe' ? config.stripe_connected_account_id : null,
      squareApplicationId: config.active_processor === 'square' ? config.square_application_id : null,
      squareLocationId: config.active_processor === 'square' ? config.square_location_id : null,
      squareEnvironment: process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' as const : 'sandbox' as const,
      cardFeePct: config.card_fee_pct,
      startingCashFloat: config.starting_cash_float,
      showDiscountAtCheckout: config.show_discount_at_checkout,
    };
  }

  private buildProcessor(
    kind: 'stripe' | 'square' | 'external',
    config: { stripe_connected_account_id: string | null; square_location_id: string | null } | undefined,
  ): PaymentProcessor {
    if (kind === 'stripe') return new StripeAdapter(config?.stripe_connected_account_id ?? null);
    if (kind === 'square') return new SquareAdapter(config?.square_location_id ?? null);
    return new ExternalAdapter();
  }

  async checkout(locationId: string, actorUserId: string, dto: CheckoutDto) {
    const trx = db();

    if (!dto.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required');
    const previousAttempt = await trx.selectFrom('payment_attempts').selectAll().where('location_id', '=', locationId).where('idempotency_key', '=', dto.idempotencyKey).executeTakeFirst();
    if (previousAttempt?.status === 'succeeded' && previousAttempt.transaction_id) {
      return trx.selectFrom('transactions').selectAll().where('id', '=', previousAttempt.transaction_id).executeTakeFirstOrThrow();
    }
    if (previousAttempt) throw new ConflictException(`Checkout attempt is ${previousAttempt.status}; use a new attempt only after reviewing it.`);

    if (dto.lineItems.length === 0) {
      throw new BadRequestException('At least one line item is required');
    }
    const amountError = validateCheckoutAmounts({ lineItems: dto.lineItems, tip: dto.tip });
    if (amountError) throw new BadRequestException(amountError);

    const entry = await trx.selectFrom('queue_entries').selectAll().where('id', '=', dto.queueEntryId).executeTakeFirst();
    if (!entry) throw new NotFoundException('Queue entry not found');
    if (entry.status !== 'in_service') {
      throw new ConflictException('Only an in-service entry can be checked out');
    }
    if (dto.serviceId && dto.serviceId !== entry.service_id) {
      const service = await trx.selectFrom('services').select('id').where('id', '=', dto.serviceId).where('location_id', '=', locationId).executeTakeFirst();
      if (!service) throw new BadRequestException('Selected service is not available at this location');
      await trx.updateTable('queue_entries').set({ service_id: dto.serviceId, updated_at: new Date() }).where('id', '=', entry.id).execute();
    }

    // The request premium is earned only when the person originally requested
    // is also the person who performed the service. Reassignment must not turn
    // an unfulfilled preference into a charge, and the client is never trusted
    // to decide the premium amount.
    const performedByStaffId = dto.locationStaffId ?? entry.assigned_location_staff_id;
    const requestWasFulfilled = requestedPremiumIsEarned(entry.requested_location_staff_id, performedByStaffId);
    const clientLineItems = dto.lineItems.filter((item) => item.name !== 'Requested barber premium');
    const retailRequestCounts = countProducts(clientLineItems);
    const featureSettings = await trx.selectFrom('location_feature_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    if (featureSettings?.retail_products_enabled === false && retailRequestCounts.size > 0) {
      throw new BadRequestException('Retail product checkout is disabled for this location');
    }
    for (const item of clientLineItems.filter((candidate) => candidate.itemType === 'retail')) {
      if (!item.productId) throw new BadRequestException(`Product identity is missing for "${item.name}". Remove it and add it again.`);
    }
    const retailIds = [...retailRequestCounts.keys()];
    const catalogProducts = retailIds.length
      ? await trx.selectFrom('products').selectAll().where('location_id', '=', locationId).where('id', 'in', retailIds).forUpdate().execute()
      : [];
    const productById = new Map(catalogProducts.map((product) => [product.id, product]));
    for (const [productId, quantity] of retailRequestCounts) {
      const product = productById.get(productId);
      if (!product) throw new BadRequestException('One of the selected products is no longer available at this location.');
      if (product.stock_qty < quantity) throw new ConflictException(`${product.name} only has ${product.stock_qty} in stock.`);
    }
    const verifiedClientLineItems = clientLineItems.map((item) => {
      if (item.itemType !== 'retail') return item;
      const product = productById.get(item.productId!)!;
      return { ...item, name: product.name, price: Number(product.price), taxable: true };
    });
    let barberPremium = 0;
    if (requestWasFulfilled) {
      const policy = await trx.selectFrom('location_pricing_policy').selectAll().where('location_id', '=', locationId).executeTakeFirst();
      if (policy?.barber_request_mode === 'flat') barberPremium = Number(policy.flat_surcharge_amount);
      if (policy?.barber_request_mode === 'per_staff') {
        const requestedStaff = await trx
          .selectFrom('location_staff')
          .select('price_tier_amount')
          .where('id', '=', entry.requested_location_staff_id!)
          .where('location_id', '=', locationId)
          .executeTakeFirst();
        barberPremium = Number(requestedStaff?.price_tier_amount ?? 0);
      }
    }
    const lineItems = barberPremium > 0
      ? [...verifiedClientLineItems, { name: 'Requested barber premium', itemType: 'service' as const, price: barberPremium, taxable: verifiedClientLineItems.find((item) => item.itemType === 'service')?.taxable ?? false }]
      : verifiedClientLineItems;

    const taxConfig = await trx.selectFrom('tax_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    const retailTaxPct = Number(taxConfig?.retail_tax_pct ?? 0);

    const rawSubtotal = lineItems.reduce((sum, item) => sum + item.price, 0);
    const rawTaxableAmount = lineItems.reduce((sum, item) => (item.taxable ? sum + item.price : sum), 0);

    // Discount codes are validated and priced server-side only — the
    // client sends a code string, never a discount amount, so a tampered
    // request can't just declare its own discount.
    let discountCodeId: string | null = null;
    let discountAmount = 0;
    if (dto.discountCode) {
      if (featureSettings?.discount_codes_enabled === false) throw new BadRequestException('Discount codes are disabled for this location');
      const code = dto.discountCode.trim().toUpperCase();
      const discount = await trx
        .selectFrom('discount_codes')
        .selectAll()
        .where('location_id', '=', locationId)
        .where('code', '=', code)
        .executeTakeFirst();
      if (!discount) throw new BadRequestException(`Discount code "${code}" not found`);
      if (!discount.active) throw new BadRequestException(`Discount code "${code}" is no longer active`);
      if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
        throw new BadRequestException(`Discount code "${code}" has expired`);
      }
      discountCodeId = discount.id;
      discountAmount =
        discount.discount_type === 'percent' ? rawSubtotal * (Number(discount.value) / 100) : Math.min(Number(discount.value), rawSubtotal);
    }

    const subtotal = rawSubtotal - discountAmount;
    // Tax is computed on the taxable portion of the DISCOUNTED subtotal —
    // scale the taxable amount down by the same ratio the discount took
    // off the whole sale, rather than taxing the pre-discount price.
    const discountRatio = rawSubtotal > 0 ? discountAmount / rawSubtotal : 0;
    const tax = rawTaxableAmount * (1 - discountRatio) * (retailTaxPct / 100);
    const total = subtotal + tax + dto.tip;
    const amountCents = Math.round(total * 100);

    let processorRef: string | null = null;
    let transactionProcessor: 'stripe' | 'square' | 'external' | null = null;
    const attempt = await trx.insertInto('payment_attempts').values({ location_id: locationId, queue_entry_id: entry.id, idempotency_key: dto.idempotencyKey, status: 'pending', amount_cents: amountCents, processor: dto.paymentMethod }).returningAll().executeTakeFirstOrThrow();

    if (dto.paymentMethod === 'card') {
      const config = await trx.selectFrom('payment_processor_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
      const activeProcessor = config?.active_processor ?? 'external';
      if (activeProcessor === 'external') {
        throw new ConflictException('No card processor is configured for this location — use cash or the external reference path.');
      }
      if (!dto.paymentToken) {
        throw new BadRequestException('paymentToken is required for a card payment');
      }
      const processor = this.buildProcessor(activeProcessor, config);
      transactionProcessor = activeProcessor;
      let result;
      try {
        result = await processor.charge({
          amountCents,
          currency: 'usd',
          paymentToken: dto.paymentToken,
          idempotencyKey: dto.idempotencyKey,
        });
      } catch (err) {
        if (err instanceof ProcessorNotConfiguredError) {
          throw new ConflictException(err.message);
        }
        throw err;
      }
      if (!result.success) {
        await trx.updateTable('payment_attempts').set({ status: 'failed', error_message: result.errorMessage ?? 'Unknown processor error', updated_at: new Date() }).where('id', '=', attempt.id).execute();
        throw new BadRequestException(`Payment failed: ${result.errorMessage ?? 'unknown error'}`);
      }
      processorRef = result.processorRef;
    } else if (dto.paymentMethod === 'external') {
      if (!dto.externalReference) {
        throw new BadRequestException('externalReference is required for the external payment path');
      }
      const result = await new ExternalAdapter().charge({
        amountCents,
        currency: 'usd',
        paymentToken: dto.externalReference,
        idempotencyKey: dto.idempotencyKey,
      });
      if (!result.success) {
        throw new BadRequestException(result.errorMessage ?? 'External reference is required');
      }
      processorRef = result.processorRef;
      transactionProcessor = 'external';
    }
    // paymentMethod === 'cash': no processor call, processorRef stays null.

    const transaction = await trx
      .insertInto('transactions')
      .values({
        location_id: locationId,
        client_id: dto.clientId ?? entry.client_id,
        location_staff_id: dto.locationStaffId ?? entry.assigned_location_staff_id,
        queue_entry_id: entry.id,
        subtotal,
        tax,
        tip: dto.tip,
        total,
        payment_method: dto.paymentMethod,
        payment_processor: transactionProcessor,
        payment_processor_ref: processorRef,
        discount_code_id: discountCodeId,
        discount_amount: discountAmount,
        receipt_number: `SS-${(await this.localDate(locationId)).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx.updateTable('payment_attempts').set({ status: 'succeeded', processor_ref: processorRef, transaction_id: transaction.id, updated_at: new Date() }).where('id', '=', attempt.id).execute();

    if (discountCodeId) {
      await trx
        .updateTable('discount_codes')
        .set({ usage_count: sql`usage_count + 1` })
        .where('id', '=', discountCodeId)
        .execute();
    }

    await trx
      .insertInto('transaction_items')
      .values(
        lineItems.map((item) => ({
          transaction_id: transaction.id,
          name: item.name,
          item_type: item.itemType,
          price: item.price,
          taxable: item.taxable,
        })),
      )
      .execute();

    for (const [productId, quantity] of retailRequestCounts) {
      await trx.updateTable('products').set({ stock_qty: sql`stock_qty - ${quantity}` }).where('id', '=', productId).execute();
    }

    await this.queue.finalizeCompletion(locationId, entry.id, actorUserId, transaction.id);

    return transaction;
  }

  async refund(locationId: string, actorUserId: string, transactionId: string, dto: RefundDto) {
    if (!dto.reason?.trim()) throw new BadRequestException('A refund reason is required');
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required');
    const trx = db();
    const prior = await trx.selectFrom('refunds').selectAll().where('idempotency_key', '=', dto.idempotencyKey.trim()).executeTakeFirst();
    if (prior) return prior;
    const transaction = await trx.selectFrom('transactions').selectAll().where('id', '=', transactionId).where('location_id', '=', locationId).executeTakeFirst();
    if (!transaction) throw new NotFoundException('Transaction not found');
    const refunded = await trx.selectFrom('refunds').select(({ fn }) => fn.sum<string>('amount').as('total')).where('original_transaction_id', '=', transactionId).where('status', '=', 'succeeded').executeTakeFirst();
    const remaining = Number(transaction.total) - Number(refunded?.total ?? 0);
    if (!(dto.amount > 0) || dto.amount > remaining) throw new BadRequestException(`Refund must be between $0.01 and $${remaining.toFixed(2)}`);
    let processorRef: string | null = null;
    let status: 'pending' | 'succeeded' | 'failed' = 'succeeded';
    if (transaction.payment_method === 'card') {
      if (!transaction.payment_processor_ref) throw new ConflictException('This card sale has no processor reference and cannot be refunded automatically.');
      const config = await trx.selectFrom('payment_processor_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
      const originalProcessor = transaction.payment_processor ?? (transaction.payment_processor_ref.startsWith('pi_') ? 'stripe' : null);
      if (!originalProcessor || originalProcessor === 'external') throw new ConflictException('The original card processor cannot be identified. Record this refund with the original processor.');
      const processor = this.buildProcessor(originalProcessor, config);
      let result;
      try {
        result = await processor.refund({ amountCents: Math.round(dto.amount * 100), currency: 'usd', processorRef: transaction.payment_processor_ref, idempotencyKey: dto.idempotencyKey.trim() });
      } catch (err) {
        if (err instanceof ProcessorNotConfiguredError) throw new ConflictException(err.message);
        throw err;
      }
      if (!result.success) throw new BadRequestException(`Refund failed: ${result.errorMessage ?? 'unknown processor error'}`);
      processorRef = result.processorRef;
      status = 'succeeded';
    }
    return trx.insertInto('refunds').values({ original_transaction_id: transactionId, amount: dto.amount, reason: dto.reason.trim(), refunded_by_user_id: actorUserId, processor_ref: processorRef, idempotency_key: dto.idempotencyKey.trim(), status }).returningAll().executeTakeFirstOrThrow();
  }

  async closeShopSummary(locationId: string) {
    const trx = db();
    const config = await trx.selectFrom('payment_processor_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    const today = await this.localDate(locationId);
    const opening = await trx.selectFrom('shop_openings').select('actual_starting_float').where('location_id', '=', locationId).where('opening_date', '=', today).executeTakeFirst();
    const startingFloat = Number(opening?.actual_starting_float ?? config?.starting_cash_float ?? 0);
    const cardFeePct = Number(config?.card_fee_pct ?? 0);

    const location = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
    const startOfDay = startOfDayInTimezone(location.timezone);

    const todaysTxns = await trx
      .selectFrom('transactions')
      .select(['payment_method', 'total'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', startOfDay)
      .execute();

    const cashSalesTotal = todaysTxns.filter((t) => t.payment_method === 'cash').reduce((s, t) => s + Number(t.total), 0);
    const cardSalesTotal = todaysTxns.filter((t) => t.payment_method === 'card').reduce((s, t) => s + Number(t.total), 0);
    const expectedCash = startingFloat + cashSalesTotal;
    const estimatedCardFee = cardSalesTotal * (cardFeePct / 100);

    return {
      tasks: CLOSE_SHOP_TASKS,
      startingFloat,
      cashSalesTotal,
      expectedCash,
      cardSalesTotal,
      cardFeePct,
      estimatedCardFee,
    };
  }

  async openShopSummary(locationId: string) {
    const config = await db().selectFrom('payment_processor_config').select('starting_cash_float').where('location_id', '=', locationId).executeTakeFirst();
    return { tasks: OPEN_SHOP_TASKS, defaultStartingFloat: Number(config?.starting_cash_float ?? 0) };
  }

  async shopStatus(locationId: string) {
    const today = await this.localDate(locationId);
    const [opening, closing] = await Promise.all([
      db().selectFrom('shop_openings').select('created_at').where('location_id', '=', locationId).where('opening_date', '=', today).executeTakeFirst(),
      db().selectFrom('shop_closings').select('created_at').where('location_id', '=', locationId).where('closing_date', '=', today).orderBy('created_at', 'desc').executeTakeFirst(),
    ]);
    if (!opening) return { state: resolveShopState(null, closing?.created_at), openedAt: null, closedAt: closing?.created_at ?? null };
    return {
      state: resolveShopState(opening.created_at, closing?.created_at),
      openedAt: opening.created_at,
      closedAt: closing?.created_at ?? null,
    };
  }

  async openShop(locationId: string, actorUserId: string, dto: OpenShopDto) {
    const missing = OPEN_SHOP_TASKS.filter((task) => !dto.tasksCompleted.includes(task));
    if (missing.length) throw new BadRequestException({ message: 'All opening tasks must be completed', missing });
    if (!Number.isFinite(dto.actualStartingFloat) || dto.actualStartingFloat < 0) throw new BadRequestException('Opening drawer count must be zero or greater');
    const summary = await this.openShopSummary(locationId);
    const openingDate = await this.localDate(locationId);
    const opening = await db().insertInto('shop_openings').values({ location_id: locationId, opened_by_user_id: actorUserId, opening_date: openingDate, default_starting_float: summary.defaultStartingFloat, actual_starting_float: dto.actualStartingFloat, variance: dto.actualStartingFloat - summary.defaultStartingFloat, tasks_completed: dto.tasksCompleted }).onConflict((oc) => oc.columns(['location_id', 'opening_date']).doUpdateSet({ opened_by_user_id: actorUserId, default_starting_float: summary.defaultStartingFloat, actual_starting_float: dto.actualStartingFloat, variance: dto.actualStartingFloat - summary.defaultStartingFloat, tasks_completed: dto.tasksCompleted, created_at: new Date() })).returningAll().executeTakeFirstOrThrow();
    await appendEvent(db(), { locationId, eventType: 'shop_opened', entityId: opening.id, actorUserId, payload: { openingId: opening.id, actualStartingFloat: dto.actualStartingFloat, defaultStartingFloat: summary.defaultStartingFloat, variance: dto.actualStartingFloat - summary.defaultStartingFloat } });
    return opening;
  }

  async closeShop(locationId: string, actorUserId: string, dto: CloseShopDto) {
    const trx = db();

    const missing = CLOSE_SHOP_TASKS.filter((t) => !dto.tasksCompleted.includes(t));
    if (missing.length > 0) {
      throw new BadRequestException({ message: 'All closing tasks must be completed', missing });
    }

    const summary = await this.closeShopSummary(locationId);
    const variance = dto.actualCashCount - summary.expectedCash;

    const closing = await trx
      .insertInto('shop_closings')
      .values({
        location_id: locationId,
        closed_by_user_id: actorUserId,
        closing_date: await this.localDate(locationId),
        starting_float: summary.startingFloat,
        cash_sales_total: summary.cashSalesTotal,
        expected_cash: summary.expectedCash,
        actual_cash_count: dto.actualCashCount,
        variance,
        card_sales_total: summary.cardSalesTotal,
        estimated_card_fee: summary.estimatedCardFee,
        tasks_completed: dto.tasksCompleted,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await appendEvent(trx, {
      locationId,
      eventType: 'shop_closed',
      entityId: closing.id,
      actorUserId,
      payload: {
        closingId: closing.id,
        actualCashCount: dto.actualCashCount,
        expectedCash: summary.expectedCash,
        cardSalesTotal: summary.cardSalesTotal,
        variance,
      },
    });

    return closing;
  }
}
