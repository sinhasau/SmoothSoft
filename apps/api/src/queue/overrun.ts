/**
 * Live overrun adjustment for in-progress services.
 *
 * Nothing here asks a barber anything. The overrun is derived entirely from
 * `service_started_at` — stamped automatically when staff hit Start, an
 * action they already take to begin the cut — measured against the predicted
 * duration. Staff never report how behind they are.
 *
 * The spec (docs/wait-time-algorithm-spec.md §2, "Running over") originally
 * called for nudging a running-over job forward by a fixed
 * `overrun_increment_minutes` per recalculation. This implements the agreed
 * replacement:
 *
 *     buffer = actual_overrun + catch_up_buffer_minutes
 *
 * i.e. a job running x minutes behind is projected to end x + 3 minutes past
 * its original prediction, which is the same as `now + 3`.
 *
 * The `catchUpBufferMinutes` cushion matters: a job that has already run over
 * is almost never finishing this exact second, so projecting it to end at
 * `now` would be revised upward again moments later, and everyone waiting
 * would watch their estimate creep up in a series of small disappointments.
 * Quoting a little past the current moment absorbs the tail of the overrun,
 * so the number holds still instead of ratcheting.
 */
export interface InProgressJob {
  queueEntryId: string;
  staffId: string;
  startedAt: Date;
  predictedDurationMinutes: number;
}

export interface JobProjection {
  queueEntryId: string;
  staffId: string;
  /** When this job is now expected to finish (cleanup buffer NOT included). */
  projectedEnd: Date;
  /** How far past its prediction the job already is, in minutes. 0 when on time. */
  overrunMinutes: number;
}

/** Cushion added on top of the measured overrun, so the quote stops ratcheting. */
export const DEFAULT_CATCH_UP_BUFFER_MINUTES = 3;

export function projectInProgressJob(
  job: InProgressJob,
  now: Date,
  catchUpBufferMinutes = DEFAULT_CATCH_UP_BUFFER_MINUTES,
): JobProjection {
  const predictedEnd = new Date(job.startedAt.getTime() + job.predictedDurationMinutes * 60_000);
  const overrunMinutes = (now.getTime() - predictedEnd.getTime()) / 60_000;

  // Still on time: the original prediction stands. No cushion — this job has
  // given no reason to doubt it yet, and padding every healthy job would
  // inflate the whole board.
  if (overrunMinutes <= 0) {
    return { queueEntryId: job.queueEntryId, staffId: job.staffId, projectedEnd: predictedEnd, overrunMinutes: 0 };
  }

  // Running over: buffer = the real overrun + the catch-up cushion, which is
  // exactly `now + cushion`.
  return {
    queueEntryId: job.queueEntryId,
    staffId: job.staffId,
    projectedEnd: new Date(now.getTime() + catchUpBufferMinutes * 60_000),
    overrunMinutes,
  };
}

/**
 * How far behind the shop as a whole is running: the largest single overrun
 * across all in-progress jobs, not the sum or the average.
 *
 * Max, because overruns happen in parallel — three barbers each 5 minutes
 * behind have put the shop 5 minutes behind, not 15. Summing would wildly
 * over-state the delay on a busy floor; averaging would hide one badly stuck
 * chair behind several on-time ones.
 */
export function shopOverrunMinutes(projections: JobProjection[]): number {
  return projections.reduce((worst, projection) => Math.max(worst, projection.overrunMinutes), 0);
}
