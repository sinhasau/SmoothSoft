'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';
import { Card, ClickableName, StatCard } from '../../../components/ui';

interface StaffTodayRow {
  locationStaffId: string;
  fullName: string;
  /** Omitted by the API for non-management roles — payroll-sensitive. */
  classification?: string;
  clients: number;
  revenue: number;
  status: string;
}

interface ComplianceAlert {
  id: string;
  docType: string;
  description: string | null;
  expiresAt: string | null;
  status: string;
  staffName: string | null;
}

interface LineItem {
  transactionId: string;
  clientId: string | null;
  clientName: string | null;
  staffId: string | null;
  staffName: string | null;
  serviceName: string;
  billed: string;
  tip: string;
  paymentMethod: string;
  createdAt: string;
}

interface LocationDashboard {
  revenue?: number;
  serviceRevenue?: number;
  retailRevenue?: number;
  discount?: number;
  clientsServed: number;
  avgTicket?: number;
  utilizationPct: number;
  cashSales?: number;
  cardSales?: number;
  noShows: number;
  cancels: number;
  abandoned: number;
  staffToday: StaffTodayRow[];
  compliance: ComplianceAlert[];
  lineItems: LineItem[];
}
interface WaitAccuracy { sampleSize: number; medianAbsoluteErrorMinutes: number | null; withinTenMinutesPct: number | null; windowDays: number }

function money(n: number) {
  return `$${n.toFixed(0)}`;
}
function money2(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function DashboardPage({ params }: { params: { locationId: string } }) {
  const router = useRouter();
  const auth = useRequireAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'location', params.locationId],
    queryFn: () => api.get<LocationDashboard>('/dashboard/location'),
  });
  const accuracy = useQuery({ queryKey: ['queue', 'accuracy', 30], queryFn: () => api.get<WaitAccuracy>('/queue/accuracy?days=30') });

  if (isLoading || !data) return <p className="text-gray-500">Loading…</p>;
  const showClassification = auth?.role === 'org_owner' || auth?.role === 'location_manager';
  const managerView = showClassification;

  const goToSales = () => router.push(`/locations/${params.locationId}/sales`);
  const accuracyReady = (accuracy.data?.sampleSize ?? 0) >= 10 && accuracy.data?.medianAbsoluteErrorMinutes != null;

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Business pulse</p>
        <h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">A clear look at how the shop is moving today.</p>
      </header>
      <div className={`grid gap-3 sm:grid-cols-2 ${managerView ? 'xl:grid-cols-5' : 'lg:grid-cols-3'}`}>
        {managerView && <StatCard label="Revenue" value={money(data.revenue ?? 0)} onClick={goToSales} />}
        <StatCard label="Clients served" value={data.clientsServed} onClick={managerView ? goToSales : undefined} />
        {managerView && <StatCard label="Avg ticket" value={money(data.avgTicket ?? 0)} onClick={goToSales} />}
        <StatCard label="Utilization" value={`${data.utilizationPct}%`} valueClassName="text-red-700" />
        <StatCard label="Wait accuracy" value={accuracyReady ? `±${accuracy.data!.medianAbsoluteErrorMinutes} min` : 'Learning'} valueClassName={accuracyReady && accuracy.data!.medianAbsoluteErrorMinutes! <= 10 ? 'text-green-700' : ''} />
      </div>
      {accuracy.data && <p className="-mt-4 text-xs text-gray-500">{accuracyReady ? `Based on ${accuracy.data.sampleSize} completed visits in the last 30 days · ${accuracy.data.withinTenMinutesPct}% started within 10 minutes of the estimate.` : `${accuracy.data.sampleSize} of 10 completed visits collected. Accuracy appears once there is enough data to avoid a misleading result.`}</p>}

      {managerView && (data.discount ?? 0) > 0 && (
        <p className="text-sm text-gray-500 -mt-2">
          Revenue = {money2(data.serviceRevenue ?? 0)} services + {money2(data.retailRevenue ?? 0)} products − {money2(data.discount ?? 0)} discounts ={' '}
          <span className="font-medium text-black">{money2(data.revenue ?? 0)}</span>
        </p>
      )}

      <div className={`grid gap-4 ${managerView ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {managerView && <StatCard label="Cash vs card" value={`${money(data.cashSales ?? 0)} / ${money(data.cardSales ?? 0)}`} onClick={goToSales} />}
        <StatCard label="No-shows / cancels / abandoned" value={`${data.noShows} / ${data.cancels} / ${data.abandoned}`} />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Staff today</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-black/10">
                <th className="px-4 py-3 font-medium">Staff</th>
                {showClassification && <th className="px-4 py-3 font-medium">Classification</th>}
                <th className="px-4 py-3 font-medium">Clients</th>
                {managerView && <th className="px-4 py-3 font-medium">Revenue</th>}
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.staffToday.map((s) => (
                <tr key={s.locationStaffId} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    {managerView || s.locationStaffId === auth?.locationStaffId ? <ClickableName id={s.locationStaffId} name={s.fullName} href={(id) => `/locations/${params.locationId}/staff/${id}`} /> : <span>{s.fullName}</span>}
                  </td>
                  {showClassification && <td className="px-4 py-3 text-gray-500">{s.classification?.toUpperCase()}</td>}
                  <td className="px-4 py-3">{s.clients}</td>
                  {managerView && <td className="px-4 py-3">{money(s.revenue)}</td>}
                  <td className="px-4 py-3">
                    {s.status === 'off' ? <span className="text-gray-400">Off today</span> : <span className="text-green-700">On shift</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {data.compliance.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Compliance</h2>
          <div className="space-y-2">
            {data.compliance.map((c) => (
              <div key={c.id} className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-amber-900">
                    {c.staffName ? `${c.staffName}'s ` : ''}
                    {c.docType.replace(/_/g, ' ')} {c.status === 'overdue' ? 'is overdue' : 'needs attention'}
                  </div>
                  {c.description && <div className="text-sm text-amber-800">{c.description}</div>}
                </div>
                <Link href={`/locations/${params.locationId}/settings#compliance`} className="text-sm text-amber-900 underline shrink-0 whitespace-nowrap">
                  Fix in Settings
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
