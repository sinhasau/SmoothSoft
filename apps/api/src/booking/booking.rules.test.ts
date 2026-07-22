import { describe, expect, it } from 'vitest';
import { intervalsOverlap, isBookingDate } from './booking.rules';

describe('online booking rules', () => {
  it('rejects malformed booking dates', () => {
    expect(isBookingDate('2026-07-22')).toBe(true);
    expect(isBookingDate('07/22/2026')).toBe(false);
  });

  it('blocks partial overlaps but permits adjacent appointments', () => {
    const ten = new Date('2026-07-22T10:00:00Z');
    expect(intervalsOverlap(ten, 30, new Date('2026-07-22T10:20:00Z'), 20)).toBe(true);
    expect(intervalsOverlap(ten, 30, new Date('2026-07-22T10:30:00Z'), 20)).toBe(false);
  });
});
