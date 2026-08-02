/**
 * Mirrors apps/api/src/queue/lateness.ts. Duplicated rather than shared because
 * this has to recompute against a clock that ticks every 30s in the browser,
 * while the API needs the same rule server-side; the tests on both sides pin
 * the same numbers so the two cannot drift silently.
 */
export interface LatenessEntry {
  isAppt: boolean;
  apptAt: string | null;
  estimatedStart: string | null;
  lateArrival?: boolean;
}

/** Grace before "past the estimate" is worth flagging — an estimate accurate to
 *  the second was never the promise, and a 30-second slip would warn on most of
 *  the board most of the time. */
export const LATE_GRACE_MINUTES = 2;

/**
 * Minutes past the time this client was actually promised, or null when there
 * is no such promise. An appointment holder was given a clock time; a walk-in
 * only ever had the board's estimate, which moves as the queue changes — so if
 * the line got shorter they stop being late, which is correct. A late arrival
 * has deliberately been given no estimate, so there is nothing to be late
 * against.
 */
export function minutesPastPromise(entry: LatenessEntry, now: Date): number | null {
  if (entry.lateArrival) return null;
  const promised = entry.isAppt ? entry.apptAt : entry.estimatedStart;
  if (!promised) return null;
  return Math.max(0, (now.getTime() - new Date(promised).getTime()) / 60_000);
}

export function isLate(entry: LatenessEntry, now: Date, graceMinutes = LATE_GRACE_MINUTES): boolean {
  const past = minutesPastPromise(entry, now);
  return past !== null && past > graceMinutes;
}

/** What the badge reads — appointments are "late", walk-ins are "past est." */
export function latenessLabel(entry: LatenessEntry, now: Date): string | null {
  const past = minutesPastPromise(entry, now);
  if (past === null || past <= LATE_GRACE_MINUTES) return null;
  const minutes = Math.round(past);
  const amount = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  return entry.isAppt ? `${amount} late` : `${amount} past est.`;
}
