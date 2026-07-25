export function requestedPremiumIsEarned(requestedStaffId: string | null, performedByStaffId: string | null | undefined) {
  return Boolean(requestedStaffId && requestedStaffId === performedByStaffId);
}

export function countProducts(items: { itemType: string; productId?: string }[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.itemType !== 'retail' || !item.productId) continue;
    counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Guards the client-supplied monetary inputs to checkout. Retail line items are re-priced from
 * the catalog server-side, but service line items and the tip are trusted from the request, so a
 * crafted payload could otherwise submit a negative price/tip and drive the total below the real
 * amount owed. We intentionally do NOT force service prices to a catalog value — staff legitimately
 * set/adjust service prices at checkout — we only reject values that can never be valid.
 * Returns an error message, or null when the amounts are acceptable.
 */
export function validateCheckoutAmounts(input: { lineItems: { name: string; price: number }[]; tip: number }): string | null {
  if (input.lineItems.length > 100) return 'Too many line items in a single checkout';
  if (!Number.isFinite(input.tip) || input.tip < 0) return 'Tip must be zero or a positive amount';
  for (const item of input.lineItems) {
    if (!Number.isFinite(item.price) || item.price < 0) {
      return `"${item.name || 'An item'}" has an invalid price. Prices cannot be negative.`;
    }
  }
  return null;
}

export function resolveShopState(openedAt?: Date | string | null, closedAt?: Date | string | null) {
  if (!openedAt) return 'not_opened' as const;
  if (closedAt && new Date(closedAt) >= new Date(openedAt)) return 'closed' as const;
  return 'open' as const;
}
