'use client';

import Link from 'next/link';
import { Card, Pill } from '../../../components/ui';
import { useOwnerDashboard } from '../use-owner-dashboard';
import { OwnerFallback } from '../owner-fallback';

export default function OwnerLocationsPage() {
  const dashboard = useOwnerDashboard();
  const { data } = dashboard;
  if (!data) return <OwnerFallback query={dashboard} what="your locations" />;
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-8"><header><p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Organization</p><h1 className="mt-1 font-serif text-4xl">Locations</h1><p className="mt-1 text-sm text-gray-500">Choose a shop to operate it, or compare today at a glance.</p></header><div className="grid gap-4 lg:grid-cols-2">{data.locations.map((location) => <Card key={location.locationId} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl">{location.locationName}</h2><p className="mt-1 text-sm text-gray-500">{location.staffTotal} staff · {location.clientsServed} clients today</p></div><Pill tone={location.complianceStatus === 'compliant' ? 'green' : location.complianceStatus === 'overdue' ? 'red' : 'amber'}>{location.complianceStatus.replace('_', ' ')}</Pill></div><div className="mt-5 grid grid-cols-3 gap-3 border-y border-black/5 py-4 text-center"><div><strong className="block text-xl">${location.revenue.toFixed(0)}</strong><span className="text-xs text-gray-500">Revenue</span></div><div><strong className="block text-xl">{location.staffOnShift}/{location.staffTotal}</strong><span className="text-xs text-gray-500">On shift</span></div><div><strong className="block text-xl">{location.pendingScheduleRequests}</strong><span className="text-xs text-gray-500">Requests</span></div></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/locations/${location.locationId}`} className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Open dashboard</Link><Link href={`/locations/${location.locationId}/schedule`} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium">Schedule</Link><Link href={`/locations/${location.locationId}/reports`} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium">Reports</Link></div></Card>)}</div></div>;
}
