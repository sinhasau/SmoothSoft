/**
 * "Is this waiting client past the time we told them?"
 *
 * The reference time differs by entry type, and using the wrong one is the
 * whole subtlety here. An appointment holder was promised a clock time, so
 * they are late relative to `apptAt`. A walk-in was never promised anything
 * except the estimate the board produced, so they are late relative to
 * `estimatedStart` — and that estimate moves as the queue changes, which is
 * correct: if the line got shorter, they are not late any more.
 */
export interface LatenessInput {
  isAppt: boolean;
  apptAt: Date | null;
  estimatedStart: Date | null;
}

/** Minutes past the promised time, or null when there is no time to be late against. */
export function minutesPastPromise(entry: LatenessInput, now: Date): number | null {
  const promised = entry.isAppt ? entry.apptAt : entry.estimatedStart;
  if (!promised) return null;
  const minutes = (now.getTime() - promised.getTime()) / 60_000;
  return minutes > 0 ? minutes : 0;
}

/**
 * The grace period before "past the estimate" is worth telling anyone about.
 * An estimate accurate to the second was never the promise, and flagging a
 * 30-second slip would put a warning on most of the board most of the time.
 */
export const LATE_GRACE_MINUTES = 2;

export function isPastPromise(entry: LatenessInput, now: Date, graceMinutes = LATE_GRACE_MINUTES): boolean {
  const past = minutesPastPromise(entry, now);
  return past !== null && past > graceMinutes;
}
