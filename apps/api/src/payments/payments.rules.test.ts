import { describe, expect, it } from 'vitest';
import { countProducts, requestedPremiumIsEarned, resolveShopState, validateCheckoutAmounts } from './payments.rules';

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

  describe('validateCheckoutAmounts (tamper guard)', () => {
    const ok = { lineItems: [{ name: 'Haircut', price: 30 }, { name: 'Beard oil', price: 12 }], tip: 5 };

    it('accepts normal positive amounts', () => {
      expect(validateCheckoutAmounts(ok)).toBeNull();
    });

    it('accepts a zero-price line and zero tip (comped service)', () => {
      expect(validateCheckoutAmounts({ lineItems: [{ name: 'Comp', price: 0 }], tip: 0 })).toBeNull();
    });

    it('rejects a negative service price that would lower the total', () => {
      expect(validateCheckoutAmounts({ lineItems: [{ name: 'Haircut', price: -30 }], tip: 5 })).toMatch(/invalid price/i);
    });

    it('rejects a negative tip', () => {
      expect(validateCheckoutAmounts({ lineItems: [{ name: 'Haircut', price: 30 }], tip: -5 })).toMatch(/tip/i);
    });

    it('rejects non-finite amounts (NaN / Infinity)', () => {
      expect(validateCheckoutAmounts({ lineItems: [{ name: 'x', price: Number.NaN }], tip: 0 })).toMatch(/invalid price/i);
      expect(validateCheckoutAmounts({ lineItems: [{ name: 'x', price: 10 }], tip: Number.POSITIVE_INFINITY })).toMatch(/tip/i);
    });

    it('rejects an absurd number of line items', () => {
      const many = { lineItems: Array.from({ length: 101 }, () => ({ name: 'x', price: 1 })), tip: 0 };
      expect(validateCheckoutAmounts(many)).toMatch(/too many/i);
    });
  });
});
