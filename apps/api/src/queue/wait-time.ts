/**
 * Implements exactly the subset of docs/wait-time-algorithm-spec.md that's
 * marked "currently built" in its own §0 status table — a simple running
 * total, NOT the full multi-barber simulation (§3-4 of that doc):
 *
 *   "one shared clock starting at the real current time, incremented by
 *   each waiting person's own service duration, in queue order. Does not
 *   model which specific barber is busy vs. free."
 *
 * The spec's own recommendation is to build the full simulation "once
 * volume/accuracy demands it" (Live Queue PRD §10, open question 1) — not
 * before. This intentionally does not read barber status/current-job-end
 * times, per that same status table.
 */
export interface WaitTimeInput {
  queueEntryId: string;
  serviceDurationMinutes: number;
}

export interface WaitTimeEstimate {
  queueEntryId: string;
  estimatedStart: Date;
}

export function estimateWaitTimes(waitingInOrder: WaitTimeInput[], now: Date = new Date()): WaitTimeEstimate[] {
  let clock = new Date(now);
  const estimates: WaitTimeEstimate[] = [];
  for (const entry of waitingInOrder) {
    estimates.push({ queueEntryId: entry.queueEntryId, estimatedStart: new Date(clock) });
    clock = new Date(clock.getTime() + entry.serviceDurationMinutes * 60_000);
  }
  return estimates;
}
