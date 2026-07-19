import { Client, Environment } from 'square';
import type { ChargeParams, ChargeResult, PaymentProcessor } from './processor.interface';
import { ProcessorNotConfiguredError } from './processor.interface';

/**
 * Square Web Payments SDK on the frontend turns a typed/tapped card into a
 * source id ("cnon:..."), which is what reaches this backend — same
 * client-side-tokenization rule as Stripe, different SDK vocabulary.
 */
export class SquareAdapter implements PaymentProcessor {
  readonly name = 'square' as const;
  private client: Client | null = null;

  constructor(private readonly locationId: string | null) {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    if (accessToken) {
      const environment = process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox;
      this.client = new Client({ accessToken, environment });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.client) {
      throw new ProcessorNotConfiguredError('Square');
    }

    try {
      const response = await this.client.paymentsApi.createPayment({
        sourceId: params.paymentToken,
        idempotencyKey: params.idempotencyKey,
        amountMoney: { amount: BigInt(params.amountCents), currency: params.currency.toUpperCase() },
        locationId: this.locationId ?? undefined,
      });

      const payment = response.result.payment;
      if (payment?.id && payment.status === 'COMPLETED') {
        return { success: true, processorRef: payment.id };
      }
      return {
        success: false,
        processorRef: payment?.id ?? '',
        errorMessage: `Payment status: ${payment?.status ?? 'unknown'}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Square error';
      return { success: false, processorRef: '', errorMessage: message };
    }
  }
}
