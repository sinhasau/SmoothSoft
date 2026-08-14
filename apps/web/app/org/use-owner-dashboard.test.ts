import { describe, expect, it } from 'vitest';
import { normalizeOwnerDashboard } from './use-owner-dashboard';
import type { OwnerDashboard, OwnerLocation } from './org-types';

/**
 * The deploy window these pin: Vercel ships the web app before Render ships
 * the API, so a newer page renders against a response that predates its
 * fields. `organization`, `team`, `actionItems` and `pendingScheduleRequests`
 * all landed together, and a response without them blanked the workspace.
 */
describe('normalizeOwnerDashboard', () => {
  // A location as an older API sent it: everything except pendingScheduleRequests,
  // which arrived with the owner workspace. Typed as the real thing minus that
  // field, so this fixture cannot silently drift from OwnerLocation.
  const oldLocation: Omit<OwnerLocation, 'pendingScheduleRequests'> = {
    locationId: 'loc-1', locationName: 'Novi', clientsServed: 2, revenue: 100,
    staffOnShift: 1, staffTotal: 3, complianceStatus: 'compliant', complianceAlerts: 0,
    w2Count: 2, contractorCount: 1, serviceRevenue: 80, retailRevenue: 20,
    discount: 0, tax: 5, tips: 10,
  };

  // The cast is the point of the test: this shape is NOT a valid OwnerDashboard,
  // and the normalizer's job is to make it one.
  const oldResponse = {
    locations: [oldLocation],
    totals: { revenueToday: 100, clientsServed: 2 },
  } as unknown as Partial<OwnerDashboard>;

  it('supplies team and actionItems as arrays, never undefined', () => {
    // The literal crash: data.actionItems.length on undefined.
    const d = normalizeOwnerDashboard(oldResponse);
    expect(d.team).toEqual([]);
    expect(d.actionItems).toEqual([]);
    expect(() => d.actionItems.length + d.team.length).not.toThrow();
  });

  it('defaults pendingScheduleRequests per location rather than rendering undefined', () => {
    expect(normalizeOwnerDashboard(oldResponse).locations[0].pendingScheduleRequests).toBe(0);
  });

  it('fills in every total, so no metric renders as NaN or undefined', () => {
    const totals = normalizeOwnerDashboard(oldResponse).totals;
    for (const [key, value] of Object.entries(totals)) {
      expect(Number.isFinite(value), `${key} is not a number`).toBe(true);
    }
    // Values the old API did send are preserved, not overwritten by defaults.
    expect(totals.revenueToday).toBe(100);
    expect(totals.clientsServed).toBe(2);
  });

  it('leaves organization undefined rather than inventing a name', () => {
    // Pages fall back to neutral wording; fabricating a business name would be
    // worse than admitting we do not have it yet.
    expect(normalizeOwnerDashboard(oldResponse).organization).toBeUndefined();
  });

  it('survives a completely empty or missing response', () => {
    for (const input of [undefined, null, {}] as const) {
      const d = normalizeOwnerDashboard(input);
      expect(d.locations).toEqual([]);
      expect(d.team).toEqual([]);
      expect(d.actionItems).toEqual([]);
      expect(d.totals.revenueToday).toBe(0);
    }
  });

  it('passes a current full response through unchanged', () => {
    const current: OwnerDashboard = {
      organization: { id: 'o1', name: "JJ's Barbers" },
      locations: [{ ...oldLocation, pendingScheduleRequests: 4 }],
      totals: { revenueToday: 1, clientsServed: 1, staffOnShift: 1, staffTotal: 1, complianceAlerts: 1, w2Count: 1, contractorCount: 1, serviceRevenue: 1, retailRevenue: 1, discount: 1, salesTax: 1, tips: 1 },
      team: [{ userId: 'u1', fullName: 'Joel', role: 'org_owner', classification: 'w2', employmentStatus: 'active', assignments: [] }],
      actionItems: [{ id: 'a1', tone: 'red', title: 'x', href: '/y' }],
    };
    const d = normalizeOwnerDashboard(current);
    expect(d.organization?.name).toBe("JJ's Barbers");
    expect(d.locations[0].pendingScheduleRequests).toBe(4);
    expect(d.team).toHaveLength(1);
    expect(d.actionItems).toHaveLength(1);
  });
});
