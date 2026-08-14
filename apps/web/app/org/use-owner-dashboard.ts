'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { OwnerDashboard } from './org-types';

export function useOwnerDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'org'],
    queryFn: () => api.get<OwnerDashboard>('/dashboard/org'),
    enabled,
    staleTime: 30_000,
  });
}
