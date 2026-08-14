export interface RosterEntry {
  locationStaffId: string;
  fullName: string;
  role: string;
  classification: string | null;
  organizationId?: string;
  organizationName: string;
  locationId: string;
  locationName: string;
}

const LAST_STAFF_ID_KEY = 'smoothsoft:lastLoginStaffId';

export function rememberLastStaffId(locationStaffId: string) {
  try {
    window.localStorage.setItem(LAST_STAFF_ID_KEY, locationStaffId);
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded contexts — remembering
    // the last pick is a convenience, not something worth failing login over.
  }
}

export function readLastStaffId(): string | null {
  try {
    return window.localStorage.getItem(LAST_STAFF_ID_KEY);
  } catch {
    return null;
  }
}

/** The roster entry to offer as a one-tap "continue as" shortcut, if it's still present. */
export function findLastUsedEntry(roster: RosterEntry[], lastStaffId: string | null): RosterEntry | null {
  if (!lastStaffId) return null;
  return roster.find((entry) => entry.locationStaffId === lastStaffId) ?? null;
}

/** Case-insensitive match on name, role, classification, or location — for filtering long rosters. */
export function filterRoster(roster: RosterEntry[], query: string): RosterEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return roster;
  return roster.filter((entry) =>
    [entry.fullName, entry.role, entry.classification, entry.locationName, entry.organizationName]
      .filter((value): value is string => !!value)
      .some((value) => value.toLowerCase().includes(q)),
  );
}

/**
 * Where signing in as this person lands them.
 *
 * An org owner does not work a chair — their day starts at the cross-location
 * workspace, not one shop's queue board. Login used to send everyone to
 * `/locations/<id>/queue`, so the owner had to notice the sidebar and navigate
 * out to reach anything org-wide, and nothing on the login screen suggested
 * the owner view existed at all.
 */
export function landingPathAfterLogin(claims: { role: string; locationId: string }): string {
  return claims.role === 'org_owner' ? '/org' : `/locations/${claims.locationId}/queue`;
}

/**
 * Splits the roster into the organization-wide people and everyone else.
 *
 * Owners were filed under whichever location their `location_staff` row
 * happens to point at, with "org owner" as small grey text beside the name —
 * so the one role that spans every shop looked like a member of one shop.
 * They are their own group, and it is listed first.
 *
 * Grouping only; nobody is filtered out. Every roster entry appears in exactly
 * one of the two returns.
 */
export function splitOwners(roster: RosterEntry[]): { owners: RosterEntry[]; staff: RosterEntry[] } {
  return {
    owners: roster.filter((entry) => entry.role === 'org_owner'),
    staff: roster.filter((entry) => entry.role !== 'org_owner'),
  };
}

export function groupByLocation(roster: RosterEntry[]): Map<string, RosterEntry[]> {
  const byLocation = new Map<string, RosterEntry[]>();
  for (const entry of roster) {
    const key = `${entry.organizationName} — ${entry.locationName}`;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key)!.push(entry);
  }
  return byLocation;
}
