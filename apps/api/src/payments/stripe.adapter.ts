import Stripe from 'stripe';
import type { ChargeParams, ChargeResult, PaymentProcessor, RefundParams, RefundResult } from './processor.interface';
import { ProcessorNotConfiguredError } from './processor.interface';

/**
 * Stripe Connect, per SYSTEM-ARCHITECTURE-platform.md §4 — not plain
 * Stripe, since locations/booth-renters each need their own payout. The
 * `connectedAccountId` (per-location, stored in payment_processor_config)
 * is passed as the Stripe request's `stripeAccount` option so the charge
 * lands on the location's own connected account.
 *
 * Card data flow: the frontend collects card details via the Stripe
 * Payment Element, which returns a PaymentMethod id ("pm_...") — the raw
 * card number never reaches this backend or any Node process we control.
 * This adapter creates and confirms a PaymentIntent server-side using that
 * PaymentMethod id in a single call, appropriate for a staff-driven
 * in-person checkout (not a multi-step client-confirmation flow).
 */
export class StripeAdapter implements PaymentProcessor {
  readonly name = 'stripe' as const;
  private client: Stripe | null = null;

  constructor(private readonly connectedAccountId: string | null) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      this.client = new Stripe(secretKey);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.client) {
      throw new ProcessorNotConfiguredError('Stripe');
    }

    try {
      const intent = await this.client.paymentIntents.create(
        {
          amount: params.amountCents,
          currency: params.currency,
          payment_method: params.paymentToken,
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        },
        {
          idempotencyKey: params.idempotencyKey,
          ...(this.connectedAccountId ? { stripeAccount: this.connectedAccountId } : {}),
        },
      );

      if (intent.status === 'succeeded') {
        return { success: true, processorRef: intent.id };
      }
      return { success: false, processorRef: intent.id, errorMessage: `Payment status: ${intent.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Stripe error';
      return { success: false, processorRef: '', errorMessage: message };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.client) throw new ProcessorNotConfiguredError('Stripe');
    try {
      const refund = await this.client.refunds.create(
        { payment_intent: params.processorRef, amount: params.amountCents },
        { idempotencyKey: params.idempotencyKey, ...(this.connectedAccountId ? { stripeAccount: this.connectedAccountId } : {}) },
      );
      const success = refund.status === 'succeeded' || refund.status === 'pending';
      return { success, processorRef: refund.id, errorMessage: success ? undefined : `Refund status: ${refund.status}` };
    } catch (err) {
      return { success: false, processorRef: '', errorMessage: err instanceof Error ? err.message : 'Unknown Stripe refund error' };
    }
  }
}
