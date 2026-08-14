import { afterEach, describe, expect, it } from 'vitest';
import { filterRoster, findLastUsedEntry, groupByLocation, landingPathAfterLogin, readLastStaffId, rememberLastStaffId, splitOwners, type RosterEntry } from './roster-helpers';

const roster: RosterEntry[] = [
  { locationStaffId: 's1', fullName: 'Alex Rivera', role: 'org_owner', classification: 'w2', organizationName: "JJ's Barbers", locationId: 'loc1', locationName: 'Downtown' },
  { locationStaffId: 's2', fullName: 'Sam Chen', role: 'front_desk', classification: 'w2', organizationName: "JJ's Barbers", locationId: 'loc1', locationName: 'Downtown' },
  { locationStaffId: 's3', fullName: 'Jordan Lee', role: 'location_manager', classification: '1099', organizationName: "JJ's Barbers", locationId: 'loc2', locationName: 'Eastside' },
];

describe('groupByLocation', () => {
  it('groups roster entries under "org — location" keys, preserving roster order within each group', () => {
    const groups = groupByLocation(roster);
    expect(Array.from(groups.keys())).toEqual(["JJ's Barbers — Downtown", "JJ's Barbers — Eastside"]);
    expect(groups.get("JJ's Barbers — Downtown")!.map((e) => e.fullName)).toEqual(['Alex Rivera', 'Sam Chen']);
  });
});

describe('filterRoster', () => {
  it('returns the full roster for an empty or whitespace query', () => {
    expect(filterRoster(roster, '')).toEqual(roster);
    expect(filterRoster(roster, '   ')).toEqual(roster);
  });

  it('matches case-insensitively on name', () => {
    expect(filterRoster(roster, 'sam ch').map((e) => e.locationStaffId)).toEqual(['s2']);
  });

  it('matches on role', () => {
    expect(filterRoster(roster, 'manager').map((e) => e.locationStaffId)).toEqual(['s3']);
  });

  it('matches on location name', () => {
    expect(filterRoster(roster, 'eastside').map((e) => e.locationStaffId)).toEqual(['s3']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterRoster(roster, 'nonexistent')).toEqual([]);
  });
});

describe('findLastUsedEntry', () => {
  it('returns null when there is no remembered id', () => {
    expect(findLastUsedEntry(roster, null)).toBeNull();
  });

  it('returns null when the remembered id is no longer in the roster', () => {
    expect(findLastUsedEntry(roster, 'gone')).toBeNull();
  });

  it('returns the matching entry when present', () => {
    expect(findLastUsedEntry(roster, 's2')?.fullName).toBe('Sam Chen');
  });
});

describe('rememberLastStaffId / readLastStaffId', () => {
  afterEach(() => window.localStorage.clear());

  it('round-trips through localStorage', () => {
    rememberLastStaffId('s3');
    expect(readLastStaffId()).toBe('s3');
  });

  it('returns null when nothing has been remembered', () => {
    expect(readLastStaffId()).toBeNull();
  });
});

describe('landingPathAfterLogin', () => {
  it('sends an org owner to the owner workspace, not one shop’s queue', () => {
    // Login used to route everyone to /locations/<id>/queue, so the owner
    // landed inside a single shop and had to find their way out.
    expect(landingPathAfterLogin({ role: 'org_owner', locationId: 'loc1' })).toBe('/org');
  });

  it.each(['location_manager', 'front_desk', 'staff'])('sends %s to their location queue', (role) => {
    expect(landingPathAfterLogin({ role, locationId: 'loc1' })).toBe('/locations/loc1/queue');
  });

  it('treats an unknown role as location staff rather than as an owner', () => {
    // Failing closed matters: guessing "owner" for a role we do not recognise
    // would drop someone into the cross-location workspace.
    expect(landingPathAfterLogin({ role: 'something_new', locationId: 'loc1' })).toBe('/locations/loc1/queue');
  });
});

describe('splitOwners', () => {
  it('lifts org owners out of the per-location grouping', () => {
    const { owners, staff } = splitOwners(roster);
    expect(owners.map((e) => e.fullName)).toEqual(['Alex Rivera']);
    expect(staff.map((e) => e.fullName)).toEqual(['Sam Chen', 'Jordan Lee']);
  });

  it('loses nobody — every entry lands in exactly one group', () => {
    // The grouping rule this repo keeps relearning: group, never filter.
    const { owners, staff } = splitOwners(roster);
    expect(owners.length + staff.length).toBe(roster.length);
    const seen = [...owners, ...staff].map((e) => e.locationStaffId).sort();
    expect(seen).toEqual(roster.map((e) => e.locationStaffId).sort());
  });

  it('handles a roster with no owner at all', () => {
    const { owners, staff } = splitOwners(roster.filter((e) => e.role !== 'org_owner'));
    expect(owners).toEqual([]);
    expect(staff).toHaveLength(2);
  });

  it('handles a roster that is entirely owners', () => {
    // The "all" case, not just the "some" case.
    const allOwners = roster.map((e) => ({ ...e, role: 'org_owner' }));
    const { owners, staff } = splitOwners(allOwners);
    expect(owners).toHaveLength(3);
    expect(staff).toEqual([]);
  });

  it('handles an empty roster', () => {
    expect(splitOwners([])).toEqual({ owners: [], staff: [] });
  });
});
