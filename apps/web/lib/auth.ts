'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';

export interface AuthClaims {
  userId: string;
  locationStaffId: string;
  organizationId: string;
  locationId: string;
  role: string;
  fullName: string;
}

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AuthClaims | null>('/auth/me'),
    staleTime: 60_000,
  });
}

/** Redirects to /login if there's no active session. Call at the top of any protected page. */
export function useRequireAuth(): AuthClaims | null {
  const { data, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !data) {
      router.replace('/login');
    }
  }, [isLoading, data, router]);

  return data ?? null;
}
