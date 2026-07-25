import { describe, expect, it } from 'vitest';
import { dateInTimezone, dayOfWeekForDate, dayOfWeekInTimezone, instantFromWallClock, startOfDayInTimezone } from './time';

describe('location time', () => {
  it('keeps late-evening Detroit activity on the correct business date', () => {
    const now = new Date('2026-07-22T00:30:00Z');
    expect(dateInTimezone('America/Detroit', now)).toBe('2026-07-21');
    expect(dayOfWeekInTimezone('America/Detroit', now)).toBe(2);
    expect(startOfDayInTimezone('America/Detroit', now).toISOString()).toBe('2026-07-21T04:00:00.000Z');
  });
});

describe('instantFromWallClock (booking slot anchoring)', () => {
  it('resolves a summer (EDT, UTC-4) wall-clock time to the right instant', () => {
    expect(instantFromWallClock('America/Detroit', 2026, 7, 25, 9, 30).toISOString()).toBe('2026-07-25T13:30:00.000Z');
  });

  it('resolves a winter (EST, UTC-5) wall-clock time to the right instant — DST aware', () => {
    expect(instantFromWallClock('America/Detroit', 2026, 1, 15, 9, 30).toISOString()).toBe('2026-01-15T14:30:00.000Z');
  });

  it('does not depend on the server timezone — a 9:30 slot is 9:30 local, not 9:30 server-local', () => {
    // The pre-fix bug: new Date(`2026-07-25T09:30:00`) parsed in server-local time. This asserts the
    // instant reads back as 09:30 on a Detroit clock regardless of where the process runs.
    const instant = instantFromWallClock('America/Detroit', 2026, 7, 25, 9, 30);
    expect(dateInTimezone('America/Detroit', instant)).toBe('2026-07-25');
  });
});

describe('dayOfWeekForDate', () => {
  it('returns the calendar weekday independent of timezone', () => {
    expect(dayOfWeekForDate('2026-07-21')).toBe(2); // Tuesday
    expect(dayOfWeekForDate('2026-07-25')).toBe(6); // Saturday
  });
});
