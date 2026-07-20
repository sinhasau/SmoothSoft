'use client';

import { useRequireAuth } from '../../../lib/auth';
import { TabLink } from '../../../components/ui';

export default function LocationLayout({ children, params }: { children: React.ReactNode; params: { locationId: string } }) {
  const auth = useRequireAuth();
  const base = `/locations/${params.locationId}`;

  if (!auth) return null;

  return (
    <div className="min-h-screen px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">JJ's Barbers</h1>
          <p className="text-sm text-gray-500">
            Signed in as {auth.fullName} · {auth.role.replace('_', ' ')}
          </p>
        </div>
        <a href="/org" className="text-sm underline text-gray-500 hover:text-black">
          Owner dashboard
        </a>
      </div>

      <nav className="flex gap-2 mb-6">
        <TabLink href={`${base}`}>Dashboard</TabLink>
        <TabLink href={`${base}/queue`}>Live queue</TabLink>
        <TabLink href={`${base}/schedule`}>Schedule</TabLink>
        <TabLink href={`${base}/clients`}>Clients</TabLink>
        <TabLink href={`${base}/settings`}>Settings</TabLink>
      </nav>

      {children}
    </div>
  );
}
