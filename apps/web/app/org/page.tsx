'use client';

import Link from 'next/link';
import { Card, Pill, StatCard } from '../../components/ui';
import { useOwnerDashboard } from './use-owner-dashboard';

const COMPLIANCE_TONE = { compliant: 'green', needs_attention: 'amber', overdue: 'red' } as const;
const COMPLIANCE_LABEL = { compliant: 'Compliant', needs_attention: 'Needs attention', overdue: 'Overdue' };

export default function OwnerHomePage() {
  const { data, isLoading, error } = useOwnerDashboard();
  if (isLoading || !data) return <OwnerPageState message={error ? 'Unable to load the owner workspace.' : 'Loading your business…'} />;

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfd9cd] pb-5">
        <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Owner workspace</p><h1 className="font-serif text-4xl font-medium tracking-tight">Good overview, {data.organization.name}</h1><p className="mt-1 text-sm text-gray-500">Everything requiring an owner decision, across {data.locations.length} locations.</p></div>
        <Link href={`/locations/${data.locations[0]?.locationId}`} className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white">Open a shop</Link>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action center</h2><span className="text-xs text-gray-400">{data.actionItems.length} open</span></div>
        <Card>
          {data.actionItems.length === 0 ? <div className="flex items-center gap-3 px-4 py-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-green-100 text-green-700">✓</span><div><div className="font-medium">Nothing urgent</div><div className="text-sm text-gray-500">Payroll, schedules, and compliance have no open setup alerts.</div></div></div> : data.actionItems.map((item) => <Link key={item.id} href={item.href} className="flex items-center justify-between border-b border-black/5 px-4 py-4 last:border-0 hover:bg-black/[0.02]"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${item.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} /><span className="font-medium">{item.title}</span></div><span aria-hidden="true">→</span></Link>)}
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue today" value={`$${data.totals.revenueToday.toFixed(0)}`} />
        <StatCard label="Clients served" value={data.totals.clientsServed} />
        <StatCard label="Staff on shift" value={`${data.totals.staffOnShift} / ${data.totals.staffTotal}`} />
        <StatCard label="Owner alerts" value={data.actionItems.length} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Locations</h2><Link href="/org/locations" className="text-sm font-medium">View all →</Link></div>
        <Card>{data.locations.map((location) => <Link key={location.locationId} href={`/locations/${location.locationId}`} className="grid grid-cols-[1fr_auto] gap-4 border-b border-black/5 px-4 py-4 last:border-0 hover:bg-black/[0.02] sm:grid-cols-[1fr_8rem_8rem_auto]"><div><div className="font-medium">{location.locationName}</div><div className="mt-0.5 text-sm text-gray-500">{location.clientsServed} clients · {location.staffOnShift}/{location.staffTotal} on shift</div></div><div className="hidden text-right sm:block"><div className="text-xs text-gray-500">Revenue</div><strong>${location.revenue.toFixed(0)}</strong></div><div className="hidden text-right sm:block"><div className="text-xs text-gray-500">Requests</div><strong>{location.pendingScheduleRequests}</strong></div><Pill tone={COMPLIANCE_TONE[location.complianceStatus]}>{COMPLIANCE_LABEL[location.complianceStatus]}</Pill></Link>)}</Card>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <OwnerShortcut href="/org/team" title="Manage your team" body={`${data.team.length} people across ${data.locations.length} locations`} action="Open team" />
        <OwnerShortcut href="/org/payroll" title="Prepare payroll" body="Review each location's current period and exceptions" action="Open payroll" />
        <OwnerShortcut href="/org/reports" title="Understand performance" body="Run financial, client, labor, and compliance reports" action="Open reports" />
      </section>
    </div>
  );
}

function OwnerShortcut({ href, title, body, action }: { href: string; title: string; body: string; action: string }) {
  return <Link href={href}><Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-sm"><h2 className="font-serif text-xl">{title}</h2><p className="mt-2 min-h-10 text-sm text-gray-500">{body}</p><div className="mt-5 text-sm font-semibold">{action} →</div></Card></Link>;
}

function OwnerPageState({ message }: { message: string }) { return <div className="px-6 py-8 text-sm text-gray-500">{message}</div>; }
