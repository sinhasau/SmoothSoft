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

export function groupByLocation(roster: RosterEntry[]): Map<string, RosterEntry[]> {
  const byLocation = new Map<string, RosterEntry[]>();
  for (const entry of roster) {
    const key = `${entry.organizationName} — ${entry.locationName}`;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key)!.push(entry);
  }
  return byLocation;
}
