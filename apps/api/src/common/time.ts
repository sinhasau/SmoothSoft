function partsInTimezone(timezone: string, now: Date, includeTime = false) {
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
  if (includeTime) Object.assign(options, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

export function dateInTimezone(timezone: string, now = new Date()) {
  const { year, month, day } = partsInTimezone(timezone, now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function startOfDayInTimezone(timezone: string, now = new Date()) {
  const { year, month, day } = partsInTimezone(timezone, now);
  return instantFromWallClock(timezone, year, month, day, 0, 0);
}

/**
 * Resolve a wall-clock time in a given timezone to the correct absolute UTC instant.
 * e.g. instantFromWallClock('America/Detroit', 2026, 7, 25, 9, 30) is the instant that
 * reads 09:30 on a clock in Detroit that day. Used by the booking slot engine so slot
 * times are anchored to the shop's local clock, not the server's.
 *
 * Single-guess offset resolution (same approach as the rest of this module): construct the
 * naive UTC instant, read back the timezone's offset at that instant, and subtract it. This
 * is exact except inside the ~1h "fall back" window where a wall-clock time is ambiguous;
 * salon opening hours don't straddle the 2 AM DST boundary in practice.
 */
export function instantFromWallClock(timezone: string, year: number, month: number, day: number, hour: number, minute: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const atGuess = partsInTimezone(timezone, utcGuess, true);
  const timezoneOffsetMs = Date.UTC(atGuess.year, atGuess.month - 1, atGuess.day, atGuess.hour, atGuess.minute, atGuess.second) - utcGuess.getTime();
  return new Date(utcGuess.getTime() - timezoneOffsetMs);
}

/** Calendar day-of-week (0=Sun) for a plain YYYY-MM-DD date. Timezone-independent. */
export function dayOfWeekForDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function dayOfWeekInTimezone(timezone: string, now = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}
