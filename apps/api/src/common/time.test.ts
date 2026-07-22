import { describe, expect, it } from 'vitest';
import { dateInTimezone, dayOfWeekInTimezone, startOfDayInTimezone } from './time';

describe('location time', () => {
  it('keeps late-evening Detroit activity on the correct business date', () => {
    const now = new Date('2026-07-22T00:30:00Z');
    expect(dateInTimezone('America/Detroit', now)).toBe('2026-07-21');
    expect(dayOfWeekInTimezone('America/Detroit', now)).toBe(2);
    expect(startOfDayInTimezone('America/Detroit', now).toISOString()).toBe('2026-07-21T04:00:00.000Z');
  });
});
