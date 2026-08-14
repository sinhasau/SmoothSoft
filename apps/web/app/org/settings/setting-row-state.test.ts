import { describe, expect, it } from 'vitest';
import { driftTarget, isDirty, shopsDiffering } from './setting-row-state';

describe('isDirty', () => {
  it('is false on arrival for a field with no org default', () => {
    // The regression this exists for. Every unset field used to render as an
    // unsaved change, so the page opened with scope choosers already showing
    // and a Save button attached to a row nobody had touched.
    expect(isDirty(false, null, false)).toBe(false);
    expect(isDirty(false, null, 0)).toBe(false);
    expect(isDirty(false, null, 'same')).toBe(false);
  });

  it('is false on arrival for a field that already has an org default', () => {
    expect(isDirty(false, true, true)).toBe(false);
    expect(isDirty(false, 12, 12)).toBe(false);
  });

  it('is true once the owner chooses a value where there was no default', () => {
    // Choosing "off" when nothing was set IS a change — saving creates the default.
    expect(isDirty(true, null, false)).toBe(true);
    expect(isDirty(true, null, true)).toBe(true);
  });

  it('is true when a touched value differs from the saved default', () => {
    expect(isDirty(true, false, true)).toBe(true);
    expect(isDirty(true, 12, 15)).toBe(true);
    expect(isDirty(true, 'same', 'flat')).toBe(true);
  });

  it('is false when the owner toggles back to the saved value', () => {
    expect(isDirty(true, true, true)).toBe(false);
    expect(isDirty(true, 12, 12)).toBe(false);
  });

  it('treats a numeric string and its number as the same value', () => {
    // A number input hands back strings; "12" is not a change from 12.
    expect(isDirty(true, 12, '12')).toBe(false);
  });
});

describe('driftTarget', () => {
  it('uses the saved default until the owner touches the field', () => {
    expect(driftTarget(false, true, false)).toBe(true);
  });

  it('uses the pending value once touched, so the preview matches what will save', () => {
    expect(driftTarget(true, true, false)).toBe(false);
  });

  it('is null when there is no default and nothing has been touched', () => {
    expect(driftTarget(false, null, false)).toBeNull();
  });
});

describe('shopsDiffering', () => {
  const shops = [
    { locationName: 'Novi', settings: { retail: true, burden: 10 } },
    { locationName: 'South Lyon', settings: { retail: false, burden: 10 } },
    { locationName: 'New TBD', settings: { retail: true, burden: 25 } },
  ];

  it('names only the shops that actually differ', () => {
    expect(shopsDiffering(shops, 'retail', true).map((s) => s.locationName)).toEqual(['South Lyon']);
    expect(shopsDiffering(shops, 'burden', 10).map((s) => s.locationName)).toEqual(['New TBD']);
  });

  it('returns nothing when every shop matches', () => {
    expect(shopsDiffering(shops, 'retail', false).map((s) => s.locationName)).toEqual(['Novi', 'New TBD']);
    expect(shopsDiffering([{ settings: { retail: true } }], 'retail', true)).toEqual([]);
  });

  it('reports no drift when there is no org default to compare against', () => {
    // Comparing against a placeholder would invent drift that does not exist.
    expect(shopsDiffering(shops, 'retail', null)).toEqual([]);
  });

  it('treats a missing per-shop value as differing from a real target', () => {
    expect(shopsDiffering([{ settings: {} }], 'retail', true)).toHaveLength(1);
  });

  it('handles an organization with no shops yet', () => {
    expect(shopsDiffering([], 'retail', true)).toEqual([]);
  });
});
