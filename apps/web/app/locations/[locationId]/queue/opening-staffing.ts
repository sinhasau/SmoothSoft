/**
 * What to say about staffing when someone opens the store.
 *
 * The report this comes from: a store was opened on an off day, nobody could
 * be clocked in, and nothing on the screen said why. The location had no
 * barbers on its roster at all — a setup problem that only ever surfaced as a
 * greyed-out button several taps away, long after the store was already open.
 *
 * Opening is the right moment to say it, because it is the moment the shop
 * starts accepting walk-ins. An open store with nobody who can be seated is
 * not a quiet inconvenience: a customer joins the queue, watches an estimate
 * that never moves, and eventually leaves. The person in the chair is the one
 * who pays for this, so they get the benefit of the doubt.
 *
 * These warn, never block. An owner opening up twenty minutes before the first
 * barber arrives is completely normal, and refusing to open would be worse
 * than the problem — see CLAUDE.md on disabled-with-a-reason over removed.
 */
export type OpeningStaffingTone = 'blocking' | 'caution';

export interface OpeningStaffingWarning {
  tone: OpeningStaffingTone;
  headline: string;
  detail: string;
}

export interface OpeningStaffingInput {
  /** Staff assigned to this location, whatever their status. */
  rosterCount: number;
  /** Staff currently clocked in (any status except `off`). */
  onFloorCount: number;
}

export function openingStaffingWarning({
  rosterCount,
  onFloorCount,
}: OpeningStaffingInput): OpeningStaffingWarning | null {
  // Somebody is on the floor: the shop can serve people. Nothing to say.
  if (onFloorCount > 0) return null;

  // No roster is a different problem from an empty floor, and a much worse
  // one: it cannot be fixed by waiting. Nobody can EVER be clocked in here
  // until staff are assigned, so name the fix.
  if (rosterCount === 0) {
    return {
      tone: 'blocking',
      headline: 'No barbers are assigned to this location',
      detail:
        'Walk-ins can still join the queue, but nobody can be clocked in or seated. Add team members under Staff first.',
    };
  }

  // Roster exists, nobody in yet. Routine when opening early — a nudge, not
  // an alarm.
  return {
    tone: 'caution',
    headline: 'Nobody is clocked in yet',
    detail:
      'Clock barbers in from the Floor as they arrive, or walk-ins will wait with no one to seat them.',
  };
}
