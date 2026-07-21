'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { Card, Pill, StatCard } from '../../components/ui';

interface OrgLocation {
  locationId: string;
  locationName: string;
  clientsServed: number;
  revenue: number;
  staffOnShift: number;
  staffTotal: number;
  complianceStatus: 'compliant' | 'needs_attention' | 'overdue';
  complianceAlerts: number;
  w2Count: number;
  contractorCount: number;
  serviceRevenue: number;
  retailRevenue: number;
  discount: number;
  tax: number;
  tips: number;
}

interface OrgDashboard {
  locations: OrgLocation[];
  totals: {
    revenueToday: number;
    clientsServed: number;
    staffOnShift: number;
    staffTotal: number;
    complianceAlerts: number;
    w2Count: number;
    contractorCount: number;
    serviceRevenue: number;
    retailRevenue: number;
    discount: number;
    salesTax: number;
    tips: number;
  };
}

const COMPLIANCE_TONE: Record<string, 'green' | 'amber' | 'red'> = {
  compliant: 'green',
  needs_attention: 'amber',
  overdue: 'red',
};

const COMPLIANCE_LABEL: Record<string, string> = {
  compliant: 'Compliant',
  needs_attention: 'Needs attention',
  overdue: 'Overdue',
};

export default function OrgDashboardPage() {
  const auth = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth && auth.role !== 'org_owner') {
      router.replace(`/locations/${auth.locationId}`);
    }
  }, [auth, router]);

  const { data } = useQuery({
    queryKey: ['dashboard', 'org'],
    queryFn: () => api.get<OrgDashboard>('/dashboard/org'),
    enabled: !!auth && auth.role === 'org_owner',
  });

  if (!auth || auth.role !== 'org_owner' || !data) return <p className="text-gray-500 px-6 py-6">Loading…</p>;

  return (
    <div className="min-h-screen px-6 py-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">JJ's Barbers</h1>
          <p className="text-sm text-gray-500">{data.locations.length} locations · today</p>
        </div>
        <Link
          href={`/locations/${auth.locationId}`}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-black/30"
        >
          <span aria-hidden="true">←</span> Back to dashboard
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Revenue today" value={`$${data.totals.revenueToday.toFixed(0)}`} />
        <StatCard label="Clients served" value={data.totals.clientsServed} />
        <StatCard label="Staff on shift" value={`${data.totals.staffOnShift} / ${data.totals.staffTotal}`} />
        <StatCard label="Compliance alerts" value={data.totals.complianceAlerts} />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Locations</h2>
        <Card>
          {data.locations.map((loc) => (
            <Link
              key={loc.locationId}
              href={`/locations/${loc.locationId}`}
              className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-4 hover:bg-black/[0.02]"
            >
              <div>
                <div className="font-medium">{loc.locationName}</div>
                <div className="text-sm text-gray-500">
                  {loc.clientsServed} clients · {loc.staffOnShift}/{loc.staffTotal} staff on shift
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">${loc.revenue.toFixed(0)}</div>
                <div className="text-sm text-gray-500 mb-1">{loc.revenue > 0 && loc.staffOnShift > 0 ? `${Math.round((loc.clientsServed / loc.staffOnShift) * 20)}% util` : ''}</div>
                <Pill tone={COMPLIANCE_TONE[loc.complianceStatus]}>{COMPLIANCE_LABEL[loc.complianceStatus]}</Pill>
              </div>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="W-2 employees" value={data.totals.w2Count} />
        <StatCard label="1099 booth renters" value={data.totals.contractorCount} />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Financial snapshot — today, org-wide</h2>
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Service revenue" value={`$${data.totals.serviceRevenue.toFixed(0)}`} />
          <StatCard label="Product revenue" value={`$${data.totals.retailRevenue.toFixed(0)}`} />
          <StatCard label="Sales tax collected" value={`$${data.totals.salesTax.toFixed(0)}`} />
          <StatCard label="Tips" value={`$${data.totals.tips.toFixed(0)}`} />
          <StatCard label="Revenue today" value={`$${data.totals.revenueToday.toFixed(0)}`} />
        </div>
        {data.totals.discount > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Revenue today = ${data.totals.serviceRevenue.toFixed(2)} services + ${data.totals.retailRevenue.toFixed(2)} products − $
            {data.totals.discount.toFixed(2)} discounts = <span className="font-medium text-black">${data.totals.revenueToday.toFixed(2)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
