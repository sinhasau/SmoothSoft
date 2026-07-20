'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface RosterEntry {
  locationStaffId: string;
  fullName: string;
  role: string;
  classification: string | null;
  organizationName: string;
  locationId: string;
  locationName: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { data: roster, isLoading } = useQuery({
    queryKey: ['auth', 'roster'],
    queryFn: () => api.get<RosterEntry[]>('/auth/roster'),
  });

  const login = useMutation({
    mutationFn: (locationStaffId: string) => api.post<{ locationId: string }>('/auth/login', { locationStaffId }),
    onSuccess: (claims) => {
      router.push(`/locations/${claims.locationId}/queue`);
    },
  });

  const byLocation = new Map<string, RosterEntry[]>();
  for (const r of roster ?? []) {
    const key = `${r.organizationName} — ${r.locationName}`;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key)!.push(r);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold mb-1">Salon Platform</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Dev sign-in — pick who you're working as. This stands in for real auth; see docs/ARCHITECTURE-data-and-perspectives.md for the intended
          role/permission model.
        </p>

        {isLoading && <p className="text-gray-500">Loading staff roster…</p>}

        {Array.from(byLocation.entries()).map(([locationLabel, people]) => (
          <div key={locationLabel} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-2">{locationLabel}</h2>
            <div className="flex flex-col gap-2">
              {people.map((p) => (
                <button
                  key={p.locationStaffId}
                  onClick={() => login.mutate(p.locationStaffId)}
                  disabled={login.isPending}
                  className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-4 py-3 text-left hover:border-black/40 disabled:opacity-50"
                >
                  <span className="font-medium">{p.fullName}</span>
                  <span className="text-sm text-gray-500">
                    {p.role.replace('_', ' ')} · {p.classification?.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {login.isError && <p className="text-red-600 text-sm mt-2">Login failed. Try again.</p>}
      </div>
    </main>
  );
}
