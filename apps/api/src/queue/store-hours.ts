import { dateInTimezone, dayOfWeekForDate, instantFromWallClock } from '../common/time';

/**
 * Resolves "is the shop open right now, and when does it close" in the
 * *location's* timezone.
 *
 * This used to be done with `now.toISOString().slice(0, 10)`, `now.getDay()`,
 * and `new Date(`${date}T00:00:00`)` + `setHours()` — all three of which read
 * the server's clock, not the shop's. On a UTC server hosting a US shop that
 * produced two distinct failures:
 *
 *  - The weekday lookup drifted after local evening, because UTC had already
 *    rolled to tomorrow — so a Saturday-evening join read Sunday's row and
 *    could be told the shop was closed for the day.
 *  - `closeAt` came out in server-local time, so a 9pm Detroit close was
 *    treated as 21:00Z — 5pm local. Every afternoon join then looked like it
 *    would finish past closing, even with an empty queue.
 *
 * Both are why a customer inside real opening hours, with no wait, was turned
 * away. Everything here is derived from the shop's local calendar day.
 */
export interface HoursRow {
  is_closed?: boolean | null;
  is_open?: boolean | null;
  open_time?: string | null;
  close_time?: string | null;
}

export interface ResolvedHours {
  closed: boolean;
  openAt: Date | null;
  closeAt: Date | null;
  /** The shop's local calendar date these hours describe (YYYY-MM-DD). */
  localDate: string;
}

/** Parses "HH:MM" / "HH:MM:SS" into the absolute instant it names on `localDate` in `timezone`. */
function wallClockOn(timezone: string, localDate: string, time: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return instantFromWallClock(timezone, year, month, day, hour, minute);
}

export function resolveTodayHours(
  timezone: string,
  special: HoursRow | undefined | null,
  weekly: HoursRow | undefined | null,
  now: Date = new Date(),
): ResolvedHours {
  const localDate = dateInTimezone(timezone, now);
  const shut = { closed: true, openAt: null, closeAt: null, localDate };

  // A special-hours row for today fully replaces the weekly row, closed or not.
  if (special) {
    if (special.is_closed || !special.close_time) return shut;
    return {
      closed: false,
      openAt: special.open_time ? wallClockOn(timezone, localDate, special.open_time) : null,
      closeAt: wallClockOn(timezone, localDate, special.close_time),
      localDate,
    };
  }

  if (!weekly || weekly.is_open === false || !weekly.close_time) return shut;
  return {
    closed: false,
    openAt: weekly.open_time ? wallClockOn(timezone, localDate, weekly.open_time) : null,
    closeAt: wallClockOn(timezone, localDate, weekly.close_time),
    localDate,
  };
}

/** The weekly `store_hours.day_of_week` to look up for the shop's current local day. */
export function localDayOfWeek(timezone: string, now: Date = new Date()): number {
  return dayOfWeekForDate(dateInTimezone(timezone, now));
}
