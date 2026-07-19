/**
 * Processor-agnostic charge interface. Every adapter (Stripe, Square) does
 * client-side tokenization only: the frontend uses Stripe's Payment Element
 * or Square's Web Payments SDK to turn a typed/tapped card into an opaque
 * token, and that token — never a raw card number — is what reaches this
 * backend. See stripe.adapter.ts / square.adapter.ts for the specific
 * token shape each expects.
 */
export interface ChargeParams {
  amountCents: number;
  currency: string;
  /** Stripe PaymentMethod id ("pm_...") or Square source id ("cnon:...") from the client-side SDK. */
  paymentToken: string;
  idempotencyKey: string;
}

export interface ChargeResult {
  success: boolean;
  /** Stored in transactions.payment_processor_ref — never a card number. */
  processorRef: string;
  errorMessage?: string;
}

export interface PaymentProcessor {
  readonly name: 'stripe' | 'square' | 'external';
  isConfigured(): boolean;
  charge(params: ChargeParams): Promise<ChargeResult>;
}

export class ProcessorNotConfiguredError extends Error {
  constructor(processor: string) {
    super(
      `${processor} is not configured — missing API credentials in .env. ` +
        `Use the external/manual payment path, or set the processor's keys ` +
        `(see .env.example) to enable real card processing.`,
    );
  }
}
