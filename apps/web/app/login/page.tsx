'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  const queryClient = useQueryClient();
  const { data: roster, isLoading } = useQuery({
    queryKey: ['auth', 'roster'],
    queryFn: () => api.get<RosterEntry[]>('/auth/roster'),
  });

  const login = useMutation({
    mutationFn: (locationStaffId: string) => api.post<{ locationId: string }>('/auth/login', { locationStaffId }),
    onSuccess: (claims) => {
      // The "Switch" button (see LocationLayout) sets ['auth','me'] to null
      // with setQueryData, which react-query treats as fresh for the full
      // staleTime — so without this, useRequireAuth on the next page reads
      // that stale null and bounces straight back here instead of refetching.
      queryClient.setQueryData(['auth', 'me'], claims);
      router.push(`/locations/${claims.locationId}/queue`);
    },
  });

  const byLocation = new Map<string, RosterEntry[]>();
  for (const r of roster ?? []) {
    const key = `${r.organizationName} — ${r.locationName}`;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key)!.push(r);
  }
  const customerLocations = Array.from(new Map((roster ?? []).map((entry) => [entry.locationId, entry])).values());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-black/[0.06] bg-white/80 p-7 shadow-[0_24px_70px_rgba(55,45,30,0.10)] backdrop-blur-sm">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#315c4f] to-[#1f4037] text-lg font-bold text-[#fffaf0] shadow-md">S</div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Welcome back</p>
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">SmoothSoft</h1>
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
                  className="flex items-center justify-between rounded-xl border border-black/[0.07] bg-white/90 px-4 py-3 text-left shadow-sm transition hover:border-[#78988d] hover:bg-[#f7faf8] disabled:opacity-50"
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

        {customerLocations.length > 0 && <div className="mt-7 border-t border-black/[0.07] pt-6"><h2 className="text-sm font-semibold text-gray-700">Customer view</h2><p className="mt-1 text-xs text-gray-500">Preview the booking experience without signing in as an employee.</p><div className="mt-3 flex flex-col gap-2">{customerLocations.map((location) => <Link key={location.locationId} href={`/book/${location.locationId}`} className="flex items-center justify-between rounded-xl border border-[#cfded7] bg-[#f4f8f6] px-4 py-3 text-sm font-medium text-[#315c4f] transition hover:border-[#78988d] hover:bg-white"><span>Book at {location.locationName}</span><span aria-hidden="true">→</span></Link>)}</div></div>}

        {login.isError && <p className="text-red-600 text-sm mt-2">Login failed. Try again.</p>}
      </div>
    </main>
  );
}
