'use client';

import Link from 'next/link';
import { Card, Pill } from '../../../../components/ui';
import { useOwnerDashboard } from '../../use-owner-dashboard';
import { OwnerFallback } from '../../owner-fallback';

export default function AllStoresReportPage() {
  const dashboard = useOwnerDashboard();
  const { data } = dashboard;
  if (!data) return <OwnerFallback query={dashboard} what="the combined report" />;
  const financial = [
    ['Service revenue', `$${data.totals.serviceRevenue.toFixed(2)}`],
    ['Product revenue', `$${data.totals.retailRevenue.toFixed(2)}`],
    ['Discounts', `$${data.totals.discount.toFixed(2)}`],
    ['Net revenue', `$${data.totals.revenueToday.toFixed(2)}`],
    ['Sales tax', `$${data.totals.salesTax.toFixed(2)}`],
    ['Tips', `$${data.totals.tips.toFixed(2)}`],
  ];
  const operations = [
    ['Clients served', data.totals.clientsServed],
    ['Staff on shift', data.totals.staffOnShift],
    ['Total staff assignments', data.totals.staffTotal],
    ['W-2 assignments', data.totals.w2Count],
    ['1099 assignments', data.totals.contractorCount],
    ['Compliance alerts', data.totals.complianceAlerts],
  ];

  return <div className="mx-auto max-w-6xl space-y-7 px-5 py-6 lg:px-8"><header className="border-b border-[#dfd9cd] pb-5"><Link href="/org/reports" className="text-sm font-medium text-gray-500 hover:text-black">← All reports</Link><p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">All stores combined · today</p><h1 className="mt-1 font-serif text-4xl">{data.organization?.name ?? 'Your organization'}</h1><p className="mt-1 text-sm text-gray-500">Organization totals across {data.locations.length} stores. Select any value to see how each store contributes.</p></header><section><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Financial values</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{financial.map(([label, value]) => <CombinedMetric key={label} label={label} value={value} />)}</div></section><section><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Operating values</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{operations.map(([label, value]) => <CombinedMetric key={label} label={label} value={value} />)}</div></section><section id="locations" className="scroll-mt-5"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Store contributions</h2><Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-black/10 text-left text-gray-500"><th className="px-4 py-3 font-medium">Store</th><th className="px-4 py-3 text-right font-medium">Clients</th><th className="px-4 py-3 text-right font-medium">Services</th><th className="px-4 py-3 text-right font-medium">Products</th><th className="px-4 py-3 text-right font-medium">Discounts</th><th className="px-4 py-3 text-right font-medium">Revenue</th><th className="px-4 py-3 text-right font-medium">Tax</th><th className="px-4 py-3 text-right font-medium">Tips</th><th className="px-4 py-3 text-right font-medium">Staff</th><th className="px-4 py-3 font-medium">Compliance</th></tr></thead><tbody>{data.locations.map((location) => <tr key={location.locationId} className="border-b border-black/5 last:border-0"><td className="px-4 py-3"><Link href={`/locations/${location.locationId}/reports`} className="font-semibold underline decoration-black/15 underline-offset-4">{location.locationName}</Link></td><ClickableCell href={`/locations/${location.locationId}/clients`} value={location.clientsServed}/><ClickableCell href={`/locations/${location.locationId}/sales`} value={`$${location.serviceRevenue.toFixed(2)}`}/><ClickableCell href={`/locations/${location.locationId}/sales`} value={`$${location.retailRevenue.toFixed(2)}`}/><ClickableCell href={`/locations/${location.locationId}/reports?report=discount_usage`} value={`$${location.discount.toFixed(2)}`}/><ClickableCell href={`/locations/${location.locationId}/sales`} value={`$${location.revenue.toFixed(2)}`}/><ClickableCell href={`/locations/${location.locationId}/reports?report=tax_documentation`} value={`$${location.tax.toFixed(2)}`}/><ClickableCell href={`/locations/${location.locationId}/sales`} value={`$${location.tips.toFixed(2)}`}/><ClickableCell href={`/locations/${location.locationId}/staff`} value={`${location.staffOnShift}/${location.staffTotal}`}/><td className="px-4 py-3"><Link href={`/locations/${location.locationId}/reports?report=compliance_status`}><Pill tone={location.complianceStatus === 'compliant' ? 'green' : location.complianceStatus === 'overdue' ? 'red' : 'amber'}>{location.complianceStatus.replace('_', ' ')}</Pill></Link></td></tr>)}</tbody></table></Card></section></div>;
}

function CombinedMetric({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <Link href="#locations" className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#315c4f]"><Card className="h-full px-5 py-4 transition hover:border-[#78988d] hover:bg-white"><div className="text-sm text-gray-500">{label}</div><div className="mt-1 text-2xl font-semibold underline decoration-black/10 underline-offset-4">{value}</div><div className="mt-2 text-xs text-gray-400">View store contributions ↓</div></Card></Link>;
}

function ClickableCell({ href, value }: { href: string; value: React.ReactNode }) {
  return <td className="px-4 py-3 text-right"><Link href={href} className="font-medium underline decoration-black/15 underline-offset-4 hover:decoration-black">{value}</Link></td>;
}
