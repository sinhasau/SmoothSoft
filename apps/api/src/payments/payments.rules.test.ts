import { describe, expect, it } from 'vitest';
import { countProducts, requestedPremiumIsEarned, resolveShopState } from './payments.rules';

describe('checkout rules', () => {
  it('charges a request premium only when the requested person did the work', () => {
    expect(requestedPremiumIsEarned('requested', 'requested')).toBe(true);
    expect(requestedPremiumIsEarned('requested', 'replacement')).toBe(false);
    expect(requestedPremiumIsEarned(null, 'replacement')).toBe(false);
  });

  it('counts duplicate products for atomic stock validation', () => {
    expect([...countProducts([
      { itemType: 'retail', productId: 'oil' },
      { itemType: 'service' },
      { itemType: 'retail', productId: 'oil' },
    ])]).toEqual([['oil', 2]]);
  });

  it('shows only the operational store state that follows the latest action', () => {
    expect(resolveShopState(null, null)).toBe('not_opened');
    expect(resolveShopState('2026-07-21T12:00:00Z', null)).toBe('open');
    expect(resolveShopState('2026-07-21T12:00:00Z', '2026-07-21T22:00:00Z')).toBe('closed');
    expect(resolveShopState('2026-07-21T23:00:00Z', '2026-07-21T22:00:00Z')).toBe('open');
  });
});
