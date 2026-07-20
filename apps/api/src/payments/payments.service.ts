import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { appendEvent } from '../queue/event-log';
import { QueueService } from '../queue/queue.service';
import { StripeAdapter } from './stripe.adapter';
import { SquareAdapter } from './square.adapter';
import { ExternalAdapter } from './external.adapter';
import type { PaymentProcessor } from './processor.interface';
import { ProcessorNotConfiguredError } from './processor.interface';
import { CLOSE_SHOP_TASKS, type CheckoutDto, type CloseShopDto } from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(private readonly queue: QueueService) {}

  async getConfig(locationId: string) {
    const trx = db();
    const config = await trx
      .selectFrom('payment_processor_config')
      .selectAll()
      .where('location_id', '=', locationId)
      .executeTakeFirst();

    if (!config) {
      return { activeProcessor: 'external' as const, configured: false };
    }

    const processor = this.buildProcessor(config.active_processor, config);

    return {
      activeProcessor: config.active_processor,
      configured: processor.isConfigured(),
      stripePublishableKey: config.active_processor === 'stripe' ? config.stripe_publishable_key : null,
      squareApplicationId: config.active_processor === 'square' ? config.square_application_id : null,
      squareLocationId: config.active_processor === 'square' ? config.square_location_id : null,
      cardFeePct: config.card_fee_pct,
      startingCashFloat: config.starting_cash_float,
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

    if (dto.lineItems.length === 0) {
      throw new BadRequestException('At least one line item is required');
    }

    const entry = await trx.selectFrom('queue_entries').selectAll().where('id', '=', dto.queueEntryId).executeTakeFirst();
    if (!entry) throw new NotFoundException('Queue entry not found');
    if (entry.status !== 'in_service') {
      throw new ConflictException('Only an in-service entry can be checked out');
    }

    const taxConfig = await trx.selectFrom('tax_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    const retailTaxPct = Number(taxConfig?.retail_tax_pct ?? 0);

    const rawSubtotal = dto.lineItems.reduce((sum, item) => sum + item.price, 0);
    const rawTaxableAmount = dto.lineItems.reduce((sum, item) => (item.taxable ? sum + item.price : sum), 0);

    // Discount codes are validated and priced server-side only — the
    // client sends a code string, never a discount amount, so a tampered
    // request can't just declare its own discount.
    let discountCodeId: string | null = null;
    let discountAmount = 0;
    if (dto.discountCode) {
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
      let result;
      try {
        result = await processor.charge({
          amountCents,
          currency: 'usd',
          paymentToken: dto.paymentToken,
          idempotencyKey: randomUUID(),
        });
      } catch (err) {
        if (err instanceof ProcessorNotConfiguredError) {
          throw new ConflictException(err.message);
        }
        throw err;
      }
      if (!result.success) {
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
        idempotencyKey: randomUUID(),
      });
      if (!result.success) {
        throw new BadRequestException(result.errorMessage ?? 'External reference is required');
      }
      processorRef = result.processorRef;
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
        payment_processor_ref: processorRef,
        discount_code_id: discountCodeId,
        discount_amount: discountAmount,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

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
        dto.lineItems.map((item) => ({
          transaction_id: transaction.id,
          name: item.name,
          item_type: item.itemType,
          price: item.price,
          taxable: item.taxable,
        })),
      )
      .execute();

    await this.queue.finalizeCompletion(locationId, entry.id, actorUserId, transaction.id);

    return transaction;
  }

  async closeShopSummary(locationId: string) {
    const trx = db();
    const config = await trx.selectFrom('payment_processor_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    const startingFloat = Number(config?.starting_cash_float ?? 0);
    const cardFeePct = Number(config?.card_fee_pct ?? 0);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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
        closing_date: new Date().toISOString().slice(0, 10),
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
