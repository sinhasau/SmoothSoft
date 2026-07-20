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
  revenue: number;
  clientsServed: number;
  avgTicket: number;
  utilizationPct: number;
  cashSales: number;
  cardSales: number;
  noShows: number;
  cancels: number;
  abandoned: number;
  staffToday: StaffTodayRow[];
  compliance: ComplianceAlert[];
  lineItems: LineItem[];
}

function money(n: number) {
  return `$${n.toFixed(0)}`;
}

export default function DashboardPage({ params }: { params: { locationId: string } }) {
  const router = useRouter();
  const auth = useRequireAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'location', params.locationId],
    queryFn: () => api.get<LocationDashboard>('/dashboard/location'),
  });

  if (isLoading || !data) return <p className="text-gray-500">Loading…</p>;
  const showClassification = auth?.role === 'org_owner' || auth?.role === 'location_manager';

  const goToSales = () => router.push(`/locations/${params.locationId}/sales`);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Revenue" value={money(data.revenue)} onClick={goToSales} />
        <StatCard label="Clients served" value={data.clientsServed} onClick={goToSales} />
        <StatCard label="Avg ticket" value={money(data.avgTicket)} onClick={goToSales} />
        <StatCard label="Utilization" value={`${data.utilizationPct}%`} valueClassName="text-red-700" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Cash vs card" value={`${money(data.cashSales)} / ${money(data.cardSales)}`} onClick={goToSales} />
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
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.staffToday.map((s) => (
                <tr key={s.locationStaffId} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    <ClickableName id={s.locationStaffId} name={s.fullName} href={(id) => `/locations/${params.locationId}/staff/${id}`} />
                  </td>
                  {showClassification && <td className="px-4 py-3 text-gray-500">{s.classification?.toUpperCase()}</td>}
                  <td className="px-4 py-3">{s.clients}</td>
                  <td className="px-4 py-3">{money(s.revenue)}</td>
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
