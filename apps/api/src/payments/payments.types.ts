export interface CheckoutLineItem {
  name: string;
  itemType: 'service' | 'retail';
  price: number;
  taxable: boolean;
}

export interface CheckoutDto {
  queueEntryId: string;
  clientId?: string | null;
  locationStaffId?: string | null;
  lineItems: CheckoutLineItem[];
  tip: number;
  paymentMethod: 'cash' | 'card' | 'external';
  /** Required for paymentMethod='card': Stripe PaymentMethod id or Square source id from the client-side SDK. */
  paymentToken?: string;
  /** Required for paymentMethod='external': the terminal's confirmation/reference number — never a card number. */
  externalReference?: string;
}

/**
 * Not exhaustively specified in the handoff PRDs (which describe the
 * behavior — "7 tasks + cash drawer reconciliation" — without naming
 * each task). These are a reasonable illustrative default; a future
 * Settings addition could make this list editable per shop.
 */
export const CLOSE_SHOP_TASKS = [
  'Count and log the cash drawer',
  'Wipe down all stations and tools',
  'Sweep and mop the floor',
  'Restock retail and back-bar supplies',
  'Turn off styling equipment',
  'Take out the trash',
  'Lock the front door and set the alarm',
] as const;

export interface CloseShopDto {
  tasksCompleted: string[];
  actualCashCount: number;
}
