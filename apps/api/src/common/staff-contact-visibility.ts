import type { StaffRole } from '../db/kysely.types';

/**
 * Who may see a staff member's personal contact details.
 *
 * Home address, personal phone, personal email and emergency contact are the
 * most sensitive non-financial data the platform holds about its own staff.
 * They exist for payroll filing and for reaching someone in an emergency — not
 * for a colleague browsing the roster.
 *
 * The rule, as the owner stated it:
 *
 *   owner    → every staff member in their own organization, across locations
 *   manager  → staff at the location they are currently working in
 *   staff    → nobody but themselves
 *
 * Two properties this must have, both of which the tests pin:
 *
 * 1. **Self always wins.** Whatever the role, a person can see their own
 *    details — otherwise a barber cannot check the address payroll will mail
 *    their W-2 to.
 * 2. **Fails closed.** An unrecognised role sees nothing but themselves, and a
 *    subject in a different organization is invisible even to an owner. New
 *    roles are added to the permissive branch deliberately, never by default.
 *
 * Kept as a pure function rather than inline checks so it is testable and there
 * is exactly one answer to this question in the codebase. A rule duplicated per
 * endpoint is a rule that will disagree with itself.
 */
export interface ContactViewer {
  userId: string;
  role: StaffRole | string;
  organizationId: string;
  /**
   * The location this request is scoped to. A manager assigned to two shops
   * works in one at a time (see the X-Location-Id header and
   * rls-transaction.middleware.ts), and sees the staff of that one.
   */
  locationId: string;
}

export interface ContactSubject {
  userId: string;
  organizationId: string;
  /** Every location this person is assigned to. */
  locationIds: readonly string[];
}

export function canSeeStaffContact(viewer: ContactViewer, subject: ContactSubject): boolean {
  // Your own details, always — independent of role or location.
  if (viewer.userId === subject.userId) return true;

  // Never across organizations, not even for an owner. Cross-tenant leakage is
  // the one failure this must not have.
  if (viewer.organizationId !== subject.organizationId) return false;

  if (viewer.role === 'org_owner') return true;

  if (viewer.role === 'location_manager') {
    return subject.locationIds.includes(viewer.locationId);
  }

  // staff, front_desk, and anything not listed above.
  return false;
}

/** The fields this rule governs. Everything here is withheld or shown together. */
export interface StaffContact {
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

/**
 * Returns the contact block when the viewer may see it, and `null` when not.
 *
 * `null` rather than an object of nulls, so a client can tell "withheld from
 * you" apart from "we do not have it on file" — and so a UI showing empty
 * fields cannot imply the record is incomplete when it simply is not yours to
 * read. Empty-state-versus-error, applied to permissions.
 */
export function contactFor(
  viewer: ContactViewer,
  subject: ContactSubject,
  contact: StaffContact,
): StaffContact | null {
  return canSeeStaffContact(viewer, subject) ? contact : null;
}
