import { afterEach, describe, expect, it } from 'vitest';
import { filterRoster, findLastUsedEntry, groupByLocation, readLastStaffId, rememberLastStaffId, type RosterEntry } from './roster-helpers';

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
