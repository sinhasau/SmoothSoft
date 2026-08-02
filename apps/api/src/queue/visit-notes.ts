/**
 * Two kinds of note follow a client around, and conflating them is the thing
 * this module exists to prevent.
 *
 *   General notes (clients.notes)          — persist forever. Allergies, how
 *                                            they like to be greeted, a
 *                                            standing preference. Never
 *                                            overwritten by a visit.
 *   Service notes (queue_entries.service_notes)
 *                                          — belong to one visit. What was
 *                                            actually done, what to watch next
 *                                            time.
 *
 * A new visit starts from the previous visit's service notes so the barber
 * picks up where the last one left off ("taper a touch higher, he asked for it
 * shorter"), then edits them for what actually happens this time. The copy is
 * deliberate: editing them must not rewrite what the last barber recorded, so
 * this duplicates rather than references.
 */
export interface NotesCarryForwardInput {
  /** Notes typed during this check-in, if any. */
  providedNotes?: string | null;
  /** service_notes from this client's most recent completed visit. */
  lastVisitNotes?: string | null;
}

/**
 * What a newly created queue entry's service_notes should start as.
 *
 * Anything typed at check-in wins outright — it is about today, and someone
 * just said it out loud. Only when nothing was typed do last visit's notes
 * carry forward.
 */
export function initialServiceNotes(input: NotesCarryForwardInput): string | null {
  const provided = input.providedNotes?.trim();
  if (provided) return provided;
  const carried = input.lastVisitNotes?.trim();
  return carried ? carried : null;
}

/** True when the entry's notes came from the previous visit rather than today. */
export function isCarriedForward(input: NotesCarryForwardInput): boolean {
  return !input.providedNotes?.trim() && !!input.lastVisitNotes?.trim();
}
