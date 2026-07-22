import type { ChargeParams, ChargeResult, PaymentProcessor, RefundParams, RefundResult } from './processor.interface';

/**
 * The manual/unsupported-partner fallback. Staff mark a sale as paid via
 * an external terminal and enter that terminal's confirmation/reference
 * number — no card data of any kind is captured or stored here, which
 * keeps this path out of PCI scope entirely. `paymentToken` is repurposed
 * as that reference number (never a card number — the frontend must never
 * put a card number in this field, only a plain confirmation code).
 */
export class ExternalAdapter implements PaymentProcessor {
  readonly name = 'external' as const;

  isConfigured(): boolean {
    return true;
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!params.paymentToken || params.paymentToken.trim().length === 0) {
      return { success: false, processorRef: '', errorMessage: 'A reference number is required for the external payment path.' };
    }
    return { success: true, processorRef: params.paymentToken.trim() };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    return { success: true, processorRef: `manual-refund:${params.idempotencyKey}` };
  }
}
