export interface CheckoutLineItem {
  /** Required for retail items so price and inventory can be verified server-side. */
  productId?: string;
  name: string;
  itemType: 'service' | 'retail';
  price: number;
  taxable: boolean;
}

export interface CheckoutDto {
  /** Stable for one checkout attempt; retries must reuse it to prevent duplicate charges. */
  idempotencyKey: string;
  queueEntryId: string;
  /** Final primary service after any completion-time correction. */
  serviceId?: string;
  clientId?: string | null;
  locationStaffId?: string | null;
  lineItems: CheckoutLineItem[];
  tip: number;
  paymentMethod: 'cash' | 'card' | 'external';
  /** Required for paymentMethod='card': Stripe PaymentMethod id or Square source id from the client-side SDK. */
  paymentToken?: string;
  /** Required for paymentMethod='external': the terminal's confirmation/reference number — never a card number. */
  externalReference?: string;
  /** Optional discount code, validated and applied server-side — never trust a client-supplied discount amount. */
  discountCode?: string;
}

export interface RefundDto {
  amount: number;
  reason: string;
  idempotencyKey: string;
}

/** Exact 7-task list from the closing-checklist critique. Cash counting is its own dedicated section below, not one of these 7. */
export const CLOSE_SHOP_TASKS = [
  'Sweep and mop',
  'Sanitize tools and stations',
  'Empty trash',
  'Restock retail shelves',
  'Turn off clippers, chargers, and TVs',
  'Lock the front door',
  'Set the alarm',
] as const;

export interface CloseShopDto {
  tasksCompleted: string[];
  actualCashCount: number;
}

export const OPEN_SHOP_TASKS = [
  'Unlock doors and disarm alarm',
  'Turn on lights, equipment, and music',
  'Walk through stations and common areas',
  'Confirm tools and supplies are ready',
] as const;

export interface OpenShopDto {
  tasksCompleted: string[];
  actualStartingFloat: number;
}
