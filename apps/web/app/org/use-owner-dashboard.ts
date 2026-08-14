'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { OwnerDashboard, OwnerLocation } from './org-types';

/**
 * Fills in anything an older API did not send.
 *
 * The web app and the API deploy independently (Vercel and Render), so for a
 * few minutes after any release a newer web build is talking to an older API.
 * `organization`, `team`, `actionItems` and `pendingScheduleRequests` all
 * arrived in one change; a response predating it made the owner home page do
 * `data.actionItems.length` on `undefined` and render a blank white screen.
 *
 * Guarding at each use site was tried and missed two of the four fields, which
 * is the argument for doing it here instead: one place, applied to every
 * consumer, and the next field added is covered by the same default rather
 * than by everyone remembering. Pages keep reading `data.team` directly.
 */
export function normalizeOwnerDashboard(raw: Partial<OwnerDashboard> | undefined | null): OwnerDashboard {
  return {
    organization: raw?.organization,
    locations: (raw?.locations ?? []).map((location): OwnerLocation => ({
      ...location,
      pendingScheduleRequests: location.pendingScheduleRequests ?? 0,
    })),
    totals: {
      revenueToday: 0,
      clientsServed: 0,
      staffOnShift: 0,
      staffTotal: 0,
      complianceAlerts: 0,
      w2Count: 0,
      contractorCount: 0,
      serviceRevenue: 0,
      retailRevenue: 0,
      discount: 0,
      salesTax: 0,
      tips: 0,
      ...raw?.totals,
    },
    team: raw?.team ?? [],
    actionItems: raw?.actionItems ?? [],
  };
}

export function useOwnerDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'org'],
    queryFn: () => api.get<Partial<OwnerDashboard>>('/dashboard/org'),
    select: normalizeOwnerDashboard,
    enabled,
    staleTime: 30_000,
  });
}
