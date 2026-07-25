import { describe, expect, it } from 'vitest';
import { compensationChangedDuringPeriod } from './staff-pay.rules';

const start = new Date('2026-07-01T00:00:00Z');
const endExclusive = new Date('2026-07-15T00:00:00Z');

describe('compensationChangedDuringPeriod', () => {
  it('is false for a single rate in effect the whole period', () => {
    const rows = [{ effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null }];
    expect(compensationChangedDuringPeriod(rows, start, endExclusive)).toBe(false);
  });

  it('is true when the rate changed mid-period (old row closed, new row opened)', () => {
    const rows = [
      { effectiveFrom: new Date('2026-07-08T00:00:00Z'), effectiveTo: null },
      { effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-07-08T00:00:00Z') },
    ];
    expect(compensationChangedDuringPeriod(rows, start, endExclusive)).toBe(true);
  });

  it('ignores a prior rate that ended before the period began', () => {
    const rows = [
      { effectiveFrom: new Date('2026-06-20T00:00:00Z'), effectiveTo: null },
      { effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-06-01T00:00:00Z') },
    ];
    expect(compensationChangedDuringPeriod(rows, start, endExclusive)).toBe(false);
  });

  it('ignores a future rate that starts after the period ends', () => {
    const rows = [
      { effectiveFrom: new Date('2026-08-01T00:00:00Z'), effectiveTo: null },
      { effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-08-01T00:00:00Z') },
    ];
    expect(compensationChangedDuringPeriod(rows, start, endExclusive)).toBe(false);
  });
});
