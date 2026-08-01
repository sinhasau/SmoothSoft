/**
 * Per-barber day projection — the multi-barber simulation from
 * docs/wait-time-algorithm-spec.md §3-4, replacing the single shared clock in
 * wait-time.ts for the "what does my day look like" view.
 *
 * Staffing follows **actual clock state, not the published schedule** (the
 * agreed Option B): a barber is in the pool when their `status` says they are
 * on the floor, so a late arrival, an early departure, or unscheduled
 * coverage is reflected the moment it happens rather than when the roster
 * said it should. `status: 'break'` keeps a barber in the pool but pushes
 * their first opening past `availableAt`, since a break ends; `status: 'off'`
 * removes them entirely.
 *
 * Deliberately NOT handled here, because it needs a human decision rather
 * than a silent algorithmic one: a barber clocking out with people already
 * projected onto their timeline. Those entries fall out of the projection on
 * the next recompute and land back in the unassigned pool, which surfaces
 * them to staff instead of quietly reseating a customer.
 */
export interface TimelineStaff {
  staffId: string;
  fullName: string;
  /** Mirrors location_staff.status (db/migrations/0002_staff.sql). `busy` is
   *  system-derived while a barber is mid-service — still on the floor. */
  status: 'available' | 'busy' | 'break' | 'off';
  /** End of the current break, or when a not-yet-free barber frees up. Defaults to `now`. */
  availableAt?: Date | null;
  /** End of this barber's shift. Work is not projected past it. Null = open-ended. */
  shiftEndsAt?: Date | null;
}

export interface TimelineJob {
  queueEntryId: string;
  label: string;
  durationMinutes: number;
  /** Set when this entry is already being served — pins it to that barber, starting now. */
  inServiceWithStaffId?: string | null;
  /** Projected end for an in-progress job, from overrun.ts. */
  projectedEnd?: Date | null;
  /** Hard requested barber. Only this barber may take the entry. */
  requestedStaffId?: string | null;
  /** Scheduled appointment time — the entry is not started before it. */
  apptAt?: Date | null;
}

export interface TimelineBlock {
  queueEntryId: string;
  label: string;
  start: Date;
  end: Date;
  kind: 'in_service' | 'appointment' | 'walk_in';
}

export interface StaffTimeline {
  staffId: string;
  fullName: string;
  blocks: TimelineBlock[];
  /** When this barber next has nothing booked. */
  freeAt: Date;
}

export interface TimelineResult {
  timelines: StaffTimeline[];
  /** Entries nobody could take — no eligible barber, or the day ran out. */
  unassigned: { queueEntryId: string; label: string; reason: 'no_eligible_staff' | 'past_shift_end' }[];
}

const MINUTE = 60_000;

/**
 * Greedy earliest-free assignment, walking `jobsInPriorityOrder` (already
 * SLA-ordered by appointment-sla.ts) and seating each on whichever eligible
 * barber can start it soonest. Greedy rather than globally optimal on
 * purpose: the queue is re-projected on every board change, so a plan that
 * matches what staff would do by hand beats one that is marginally tighter
 * but reshuffles unpredictably between refreshes.
 */
export function buildBarberTimelines(
  staff: TimelineStaff[],
  jobsInPriorityOrder: TimelineJob[],
  now: Date = new Date(),
  cleanupBufferMinutes = 0,
): TimelineResult {
  const onFloor = staff.filter((member) => member.status !== 'off');
  const timelines = new Map<string, StaffTimeline>();
  const freeAt = new Map<string, number>();

  for (const member of onFloor) {
    timelines.set(member.staffId, { staffId: member.staffId, fullName: member.fullName, blocks: [], freeAt: new Date(now) });
    const readyAt = member.status === 'break' && member.availableAt ? member.availableAt.getTime() : (member.availableAt?.getTime() ?? now.getTime());
    freeAt.set(member.staffId, Math.max(now.getTime(), readyAt));
  }

  const unassigned: TimelineResult['unassigned'] = [];

  // In-progress work first: it is already happening, so it anchors each
  // barber's clock before anything waiting gets considered.
  for (const job of jobsInPriorityOrder) {
    if (!job.inServiceWithStaffId) continue;
    const timeline = timelines.get(job.inServiceWithStaffId);
    if (!timeline) continue;
    const end = job.projectedEnd ?? new Date(now.getTime() + job.durationMinutes * MINUTE);
    timeline.blocks.push({ queueEntryId: job.queueEntryId, label: job.label, start: new Date(now), end, kind: 'in_service' });
    freeAt.set(job.inServiceWithStaffId, end.getTime() + cleanupBufferMinutes * MINUTE);
  }

  for (const job of jobsInPriorityOrder) {
    if (job.inServiceWithStaffId) continue;

    const eligible = onFloor.filter((member) => !job.requestedStaffId || member.staffId === job.requestedStaffId);
    if (eligible.length === 0) {
      unassigned.push({ queueEntryId: job.queueEntryId, label: job.label, reason: 'no_eligible_staff' });
      continue;
    }

    // Earliest possible start per barber, never before a scheduled appointment time.
    let best: { member: TimelineStaff; start: number } | null = null;
    for (const member of eligible) {
      const earliest = Math.max(freeAt.get(member.staffId) ?? now.getTime(), job.apptAt?.getTime() ?? 0);
      if (!best || earliest < best.start) best = { member, start: earliest };
    }
    if (!best) {
      unassigned.push({ queueEntryId: job.queueEntryId, label: job.label, reason: 'no_eligible_staff' });
      continue;
    }

    const start = new Date(best.start);
    const end = new Date(best.start + job.durationMinutes * MINUTE);
    const shiftEnd = best.member.shiftEndsAt?.getTime();
    if (shiftEnd && end.getTime() > shiftEnd) {
      unassigned.push({ queueEntryId: job.queueEntryId, label: job.label, reason: 'past_shift_end' });
      continue;
    }

    timelines.get(best.member.staffId)!.blocks.push({
      queueEntryId: job.queueEntryId,
      label: job.label,
      start,
      end,
      kind: job.apptAt ? 'appointment' : 'walk_in',
    });
    freeAt.set(best.member.staffId, end.getTime() + cleanupBufferMinutes * MINUTE);
  }

  for (const [staffId, timeline] of timelines) {
    timeline.freeAt = new Date(freeAt.get(staffId) ?? now.getTime());
  }

  return { timelines: Array.from(timelines.values()), unassigned };
}
