'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../../lib/auth';
import { setActiveLocationId } from '../../../lib/api';
import { TabLink } from '../../../components/ui';

export default function LocationLayout({ children, params }: { children: React.ReactNode; params: { locationId: string } }) {
  const auth = useRequireAuth();
  const router = useRouter();
  const base = `/locations/${params.locationId}`;

  // Every API call under this layout goes to params.locationId — see
  // apps/web/lib/api.ts. Only org_owner is actually allowed to view a
  // location other than their own (enforced server-side too); anyone else
  // navigating to a foreign location's URL gets bounced back to their own.
  //
  // Set synchronously during render, NOT in a useEffect: React fires
  // effects child-first, so by the time this layout's effect would run,
  // the child page's useQuery has already dispatched its fetch — one
  // render too late, headerless. A parent's render body always runs
  // before any child renders, so this is the one place guaranteed to land
  // before every descendant's data fetch.
  setActiveLocationId(params.locationId);
  useEffect(() => () => setActiveLocationId(null), []);

  useEffect(() => {
    if (auth && auth.role !== 'org_owner' && auth.locationId !== params.locationId) {
      router.replace(`/locations/${auth.locationId}`);
    }
  }, [auth, params.locationId, router]);

  if (!auth) return null;
  if (auth.role !== 'org_owner' && auth.locationId !== params.locationId) return null;

  return (
    <div className="min-h-screen px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">JJ's Barbers</h1>
          <p className="text-sm text-gray-500">
            Signed in as {auth.fullName} · {auth.role.replace('_', ' ')}
          </p>
        </div>
        {auth.role === 'org_owner' && (
          <a href="/org" className="text-sm underline text-gray-500 hover:text-black">
            Owner dashboard
          </a>
        )}
      </div>

      <nav className="flex gap-2 mb-6">
        <TabLink href={`${base}`} exact>
          Dashboard
        </TabLink>
        <TabLink href={`${base}/queue`}>Live queue</TabLink>
        <TabLink href={`${base}/schedule`}>Schedule</TabLink>
        <TabLink href={`${base}/clients`}>Clients</TabLink>
        <TabLink href={`${base}/staff`}>Staff</TabLink>
        <TabLink href={`${base}/reports`}>Reports</TabLink>
        <TabLink href={`${base}/settings`}>Settings</TabLink>
      </nav>

      {children}
    </div>
  );
}
