'use client';

import Link from 'next/link';
import { Card } from '../../../components/ui';
import { useOwnerDashboard } from '../use-owner-dashboard';

const REPORT_GROUPS = [
  { title: 'Sales & revenue', description: 'Revenue trend, payment mix, discounts, services and products.', report: 'revenue_trend' },
  { title: 'Team & payroll', description: 'Revenue by staff, scheduled hours and payroll-preparation exports.', report: 'revenue_by_staff' },
  { title: 'Clients', description: 'Top clients, acquisition, retention and returning-client patterns.', report: 'top_clients' },
  { title: 'Compliance & tax', description: 'Document readiness and supporting tax records.', report: 'tax_documentation' },
];

export default function OwnerReportsPage() {
  const { data } = useOwnerDashboard();
  if (!data) return <p className="px-6 py-8 text-sm text-gray-500">Loading reports…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-5 py-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Owner workspace</p>
        <h1 className="mt-1 font-serif text-4xl">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Every value opens its supporting detail. Choose a store for operating reports, or use the final combined report for the whole organization.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerMetric href="/org/reports/all#locations" label="Revenue today" value={`$${data.totals.revenueToday.toFixed(0)}`} />
        <OwnerMetric href="/org/reports/all#locations" label="Services" value={`$${data.totals.serviceRevenue.toFixed(0)}`} />
        <OwnerMetric href="/org/reports/all#locations" label="Products" value={`$${data.totals.retailRevenue.toFixed(0)}`} />
        <OwnerMetric href="/org/reports/all#locations" label="Tips" value={`$${data.totals.tips.toFixed(0)}`} />
      </div>

      <section id="store-reports">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Report library</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {REPORT_GROUPS.map((group) => <Card key={group.title} className="p-5"><h3 className="font-serif text-xl">{group.title}</h3><p className="mt-2 text-sm text-gray-500">{group.description}</p><div className="mt-4 flex flex-wrap gap-2">{data.locations.map((location) => <Link key={location.locationId} href={`/locations/${location.locationId}/reports?report=${group.report}`} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-medium hover:border-black/30">{location.locationName}</Link>)}</div></Card>)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Location comparison today</h2>
        <Card>{data.locations.map((location) => <div key={location.locationId} className="grid grid-cols-[1fr_auto_auto] gap-5 border-b border-black/5 px-4 py-4 last:border-0"><Link href={`/locations/${location.locationId}/reports`} className="rounded-sm hover:underline"><strong>{location.locationName}</strong><div className="text-xs text-gray-500">Open store reports</div></Link><Link href={`/locations/${location.locationId}/clients`} className="text-right hover:underline"><div className="text-xs text-gray-500">Clients</div><strong>{location.clientsServed}</strong></Link><Link href={`/locations/${location.locationId}/sales`} className="text-right hover:underline"><div className="text-xs text-gray-500">Revenue · tips</div><strong>${location.revenue.toFixed(0)} · ${location.tips.toFixed(0)}</strong></Link></div>)}</Card>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Organization report</h2>
        <Link href="/org/reports/all" className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#315c4f]"><Card className="grid gap-5 p-6 transition hover:border-[#78988d] hover:bg-white md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Final report</p><h3 className="mt-1 font-serif text-2xl">All stores combined</h3><p className="mt-2 max-w-2xl text-sm text-gray-500">One owner-level view of every financial, staffing, client, and compliance value above, followed by clickable store contributions.</p></div><span className="text-sm font-semibold">Open combined report →</span></Card></Link>
      </section>
    </div>
  );
}

function OwnerMetric({ href, label, value }: { href: string; label: string; value: React.ReactNode }) {
  return <Link href={href} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#315c4f]"><Card className="h-full px-5 py-4 transition hover:border-[#78988d] hover:bg-white"><div className="text-sm text-gray-500">{label}</div><div className="mt-1 text-2xl font-semibold underline decoration-black/10 underline-offset-4">{value}</div></Card></Link>;
}
