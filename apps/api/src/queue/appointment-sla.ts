/**
 * "Soft bump" for appointment holders inside the simple running-clock model
 * (see wait-time.ts). This does NOT touch the stored, manually-drag-orderable
 * `waiting_order` — it only produces an alternate order to feed the wait-time
 * estimate, plus flags which entries needed protecting, honoring the
 * shop's `appointment_max_wait_minutes` promise (queue_config, default 10).
 *
 * An arrived (present) appointment holder whose plain FCFS position would
 * seat them later than apptAt + maxWaitMinutes gets pulled out and reinserted
 * at the LATEST position that still keeps them on time — minimizing
 * disruption to everyone else's estimate.
 */
export interface SlaCandidate {
  queueEntryId: string;
  serviceDurationMinutes: number;
  present: boolean;
  apptAt: Date | null;
}

export interface SlaResult {
  /** Effective order (ids) to feed into estimateWaitTimes — for estimate math only. */
  order: string[];
  /** Ids that had to be bumped ahead of their natural FCFS position to honor the SLA. */
  protected: Set<string>;
}

function cumulativeStarts(order: SlaCandidate[], now: Date): Date[] {
  let clock = now.getTime();
  const starts: Date[] = [];
  for (const candidate of order) {
    starts.push(new Date(clock));
    clock += candidate.serviceDurationMinutes * 60_000;
  }
  return starts;
}

export function reorderForAppointmentSla(waitingInOrder: SlaCandidate[], maxWaitMinutes: number, now: Date = new Date()): SlaResult {
  let working = [...waitingInOrder];
  const protectedIds = new Set<string>();

  // Repeat until stable: bumping one entry can change whether the next one
  // still needs bumping. Bounded by the list length, and each iteration
  // either fixes an entry or ends the loop.
  for (let guard = 0; guard < waitingInOrder.length; guard++) {
    const starts = cumulativeStarts(working, now);
    let violationIndex = -1;
    for (let i = 0; i < working.length; i++) {
      const candidate = working[i];
      if (!candidate.present || !candidate.apptAt) continue;
      const deadline = candidate.apptAt.getTime() + maxWaitMinutes * 60_000;
      if (starts[i].getTime() > deadline) {
        violationIndex = i;
        break;
      }
    }
    if (violationIndex === -1) break;

    const [entry] = working.splice(violationIndex, 1);
    protectedIds.add(entry.queueEntryId);
    const deadline = entry.apptAt!.getTime() + maxWaitMinutes * 60_000;

    // Find the latest index where inserting `entry` still starts it by its deadline.
    let insertAt = 0;
    let clock = now.getTime();
    for (let i = 0; i < working.length; i++) {
      if (clock > deadline) break;
      clock += working[i].serviceDurationMinutes * 60_000;
      insertAt = i + 1;
    }
    working.splice(insertAt, 0, entry);
  }

  return { order: working.map((entry) => entry.queueEntryId), protected: protectedIds };
}
