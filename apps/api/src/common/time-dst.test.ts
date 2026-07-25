import { describe, expect, it } from 'vitest';
import { dateInTimezone, dayOfWeekInTimezone, instantFromWallClock, startOfDayInTimezone } from './time';

/**
 * Closes launch-readiness gap #18 (validate availability/reminders across TZ,
 * DST, closures, special hours — "broad multi-location DST tests missing").
 *
 * The booking slot engine and reminder scheduling anchor wall-clock times to the
 * shop's local clock via these helpers, so a bug here silently shifts every slot
 * and reminder by an hour twice a year, or across a whole timezone. These lock in
 * the behaviour for multiple US timezones, including a no-DST zone and both DST
 * transition days.
 */

const iso = (d: Date) => d.toISOString();

describe('wall-clock anchoring across US timezones', () => {
  // 09:30 local on a fixed summer and winter date in each zone → absolute UTC instant.
  const cases: { tz: string; summer: string; winter: string }[] = [
    { tz: 'America/Detroit', summer: '2026-07-25T13:30:00.000Z', winter: '2026-01-15T14:30:00.000Z' }, // EDT-4 / EST-5
    { tz: 'America/Los_Angeles', summer: '2026-07-25T16:30:00.000Z', winter: '2026-01-15T17:30:00.000Z' }, // PDT-7 / PST-8
    { tz: 'America/Phoenix', summer: '2026-07-25T16:30:00.000Z', winter: '2026-01-15T16:30:00.000Z' }, // no DST, always -7
    { tz: 'Pacific/Honolulu', summer: '2026-07-25T19:30:00.000Z', winter: '2026-01-15T19:30:00.000Z' }, // no DST, always -10
  ];
  for (const c of cases) {
    it(`${c.tz}: 09:30 local resolves to the right instant in summer and winter`, () => {
      expect(iso(instantFromWallClock(c.tz, 2026, 7, 25, 9, 30))).toBe(c.summer);
      expect(iso(instantFromWallClock(c.tz, 2026, 1, 15, 9, 30))).toBe(c.winter);
    });
  }

  it('Arizona (no DST) does NOT shift between seasons — DST is per-zone, not global', () => {
    const jul = instantFromWallClock('America/Phoenix', 2026, 7, 25, 9, 30);
    const jan = instantFromWallClock('America/Phoenix', 2026, 1, 15, 9, 30);
    // Same wall-clock hour → same UTC hour-of-day both seasons (offset never changes).
    expect(jul.getUTCHours()).toBe(jan.getUTCHours());
    expect(jul.getUTCMinutes()).toBe(jan.getUTCMinutes());
  });
});

describe('DST transition days (America/Detroit 2026)', () => {
  // Spring forward: 2026-03-08 02:00 EST→EDT. Fall back: 2026-11-01 02:00 EDT→EST.
  it('spring-forward day: business-hours slots are already EDT; the day before is EST', () => {
    expect(iso(instantFromWallClock('America/Detroit', 2026, 3, 7, 9, 30))).toBe('2026-03-07T14:30:00.000Z'); // EST -5
    expect(iso(instantFromWallClock('America/Detroit', 2026, 3, 8, 9, 30))).toBe('2026-03-08T13:30:00.000Z'); // EDT -4
  });

  it('fall-back day: business-hours slots are already back on EST', () => {
    expect(iso(instantFromWallClock('America/Detroit', 2026, 11, 1, 9, 30))).toBe('2026-11-01T14:30:00.000Z'); // EST -5
  });

  it('consecutive half-hour slots stay 30 real minutes apart through the spring-forward business day', () => {
    // The 2 AM jump must not distort daytime slot spacing (the module documents this assumption).
    const nine = instantFromWallClock('America/Detroit', 2026, 3, 8, 9, 0);
    const nineThirty = instantFromWallClock('America/Detroit', 2026, 3, 8, 9, 30);
    const ten = instantFromWallClock('America/Detroit', 2026, 3, 8, 10, 0);
    expect(nineThirty.getTime() - nine.getTime()).toBe(30 * 60_000);
    expect(ten.getTime() - nineThirty.getTime()).toBe(30 * 60_000);
  });

  it('startOfDayInTimezone tracks the offset change across the transition', () => {
    // Midnight local on the spring-forward day is still EST (transition is at 02:00) → 05:00Z;
    // the following midnight is EDT → 04:00Z.
    expect(iso(startOfDayInTimezone('America/Detroit', new Date('2026-03-08T12:00:00Z')))).toBe('2026-03-08T05:00:00.000Z');
    expect(iso(startOfDayInTimezone('America/Detroit', new Date('2026-03-09T12:00:00Z')))).toBe('2026-03-09T04:00:00.000Z');
  });
});

describe('reminder/business-date resolution near the UTC day boundary', () => {
  it('a west-coast evening still counts as the prior local day (reminders fire on the right date)', () => {
    // 2026-07-25T05:00Z is 2026-07-24 22:00 in Los Angeles — a reminder keyed to the UTC date
    // would land a day early; keying to the shop-local date keeps it on the 24th (Friday).
    const instant = new Date('2026-07-25T05:00:00Z');
    expect(dateInTimezone('America/Los_Angeles', instant)).toBe('2026-07-24');
    expect(dayOfWeekInTimezone('America/Los_Angeles', instant)).toBe(5); // Friday
  });

  it('the same instant is already the next business day on the US east coast', () => {
    const instant = new Date('2026-07-25T05:00:00Z');
    expect(dateInTimezone('America/Detroit', instant)).toBe('2026-07-25'); // 01:00 EDT
    expect(dayOfWeekInTimezone('America/Detroit', instant)).toBe(6); // Saturday
  });
});
