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

export function resolveShopState(openedAt?: Date | string | null, closedAt?: Date | string | null) {
  if (!openedAt) return 'not_opened' as const;
  if (closedAt && new Date(closedAt) >= new Date(openedAt)) return 'closed' as const;
  return 'open' as const;
}
