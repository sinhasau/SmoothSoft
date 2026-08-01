/**
 * Live overrun adjustment for in-progress services.
 *
 * The spec (docs/wait-time-algorithm-spec.md §2, "Running over") originally
 * called for nudging a running-over job's projected end forward by a fixed
 * `overrun_increment_minutes` on each recalculation. This implements the
 * agreed replacement: use *exactly* how far behind the job actually is,
 * rather than a fixed guess.
 *
 * Once a job passes its predicted end, its projected end simply becomes
 * `now` — the honest statement "this ends no earlier than right now" — which
 * grows continuously as the overrun continues, instead of in arbitrary steps.
 *
 * A small `minimumOverrunMinutes` deadband keeps the board from twitching:
 * a barber who is 40 seconds past their prediction is not meaningfully
 * "behind", and re-rendering everyone's wait for that is noise. Below the
 * threshold the original prediction stands.
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

export function projectInProgressJob(
  job: InProgressJob,
  now: Date,
  minimumOverrunMinutes = 2,
): JobProjection {
  const predictedEnd = new Date(job.startedAt.getTime() + job.predictedDurationMinutes * 60_000);
  const overrunMs = now.getTime() - predictedEnd.getTime();
  const overrunMinutes = overrunMs / 60_000;

  if (overrunMinutes < minimumOverrunMinutes) {
    return { queueEntryId: job.queueEntryId, staffId: job.staffId, projectedEnd: predictedEnd, overrunMinutes: Math.max(0, overrunMinutes) };
  }
  // Past the deadband: the job is genuinely late, so the earliest it can end
  // is now. This IS the "add exactly how far behind we are" buffer —
  // predictedEnd + overrun === now, by definition.
  return { queueEntryId: job.queueEntryId, staffId: job.staffId, projectedEnd: new Date(now), overrunMinutes };
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
