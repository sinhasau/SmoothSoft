'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Card, ClickableName, StatCard } from '../../../components/ui';

interface StaffTodayRow {
  locationStaffId: string;
  fullName: string;
  classification: string;
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
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'location', params.locationId],
    queryFn: () => api.get<LocationDashboard>('/dashboard/location'),
  });
  // Revenue, Clients served, and Avg ticket toggle the same line-item
  // breakdown below rather than always rendering it (item 13).
  const [showLineItems, setShowLineItems] = useState(false);

  if (isLoading || !data) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Revenue" value={money(data.revenue)} onClick={() => setShowLineItems((v) => !v)} />
        <StatCard label="Clients served" value={data.clientsServed} onClick={() => setShowLineItems((v) => !v)} />
        <StatCard label="Avg ticket" value={money(data.avgTicket)} onClick={() => setShowLineItems((v) => !v)} />
        <StatCard label="Utilization" value={`${data.utilizationPct}%`} valueClassName="text-red-700" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Cash vs card" value={`${money(data.cashSales)} / ${money(data.cardSales)}`} />
        <StatCard label="No-shows / cancels / abandoned" value={`${data.noShows} / ${data.cancels} / ${data.abandoned}`} />
      </div>

      {showLineItems && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Today's transactions</h2>
          <Card className="overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-black/10">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Barber</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Billed</th>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {data.lineItems.map((li, i) => (
                  <tr key={`${li.transactionId}-${i}`} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3">
                      <ClickableName id={li.clientId} name={li.clientName} href={(id) => `/locations/${params.locationId}/clients/${id}`} />
                    </td>
                    <td className="px-4 py-3">
                      <ClickableName id={li.staffId} name={li.staffName} href={(id) => `/locations/${params.locationId}/staff/${id}`} />
                    </td>
                    <td className="px-4 py-3">{li.serviceName}</td>
                    <td className="px-4 py-3">${Number(li.billed).toFixed(2)}</td>
                    <td className="px-4 py-3">${Number(li.tip).toFixed(2)}</td>
                    <td className="px-4 py-3 capitalize">{li.paymentMethod}</td>
                  </tr>
                ))}
                {data.lineItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                      No transactions yet today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Staff today</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-black/10">
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Classification</th>
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
                  <td className="px-4 py-3 text-gray-500">{s.classification.toUpperCase()}</td>
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
              <div key={c.id} className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <div className="font-medium text-amber-900">
                  {c.staffName ? `${c.staffName}'s ` : ''}
                  {c.docType.replace(/_/g, ' ')} {c.status === 'overdue' ? 'is overdue' : 'needs attention'}
                </div>
                {c.description && <div className="text-sm text-amber-800">{c.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
