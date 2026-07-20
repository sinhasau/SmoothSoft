'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { useRequireAuth } from '../../../../lib/auth';
import { Card, ClickableName, Pill } from '../../../../components/ui';

interface ScheduleDay {
  day_of_week: number;
}

interface StaffRosterRow {
  locationStaffId: string;
  fullName: string;
  role: string;
  /** Omitted by the API for non-management roles — payroll-sensitive. */
  classification?: string;
  schedule: ScheduleDay[];
}

interface ComplianceAlert {
  staffName: string | null;
  status: string;
}

interface LocationDashboard {
  compliance: ComplianceAlert[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleSummary(schedule: ScheduleDay[]): string {
  if (schedule.length === 0) return 'Not scheduled';
  const days = schedule.map((s) => s.day_of_week).sort((a, b) => a - b);
  return days.map((d) => DAY_LABELS[d]).join('/');
}

export default function StaffTabPage({ params }: { params: { locationId: string } }) {
  const auth = useRequireAuth();
  const roster = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffRosterRow[]>('/settings/staff') });
  const dashboard = useQuery({ queryKey: ['dashboard', 'location', params.locationId], queryFn: () => api.get<LocationDashboard>('/dashboard/location') });

  const complianceByName = new Map<string, string>();
  for (const c of dashboard.data?.compliance ?? []) {
    if (c.staffName) complianceByName.set(c.staffName, c.status);
  }

  if (!roster.data) return <p className="text-gray-500">Loading…</p>;
  const showClassification = auth?.role === 'org_owner' || auth?.role === 'location_manager';

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-black/10">
            <th className="px-4 py-3 font-medium">Staff</th>
            {showClassification && <th className="px-4 py-3 font-medium">Classification</th>}
            <th className="px-4 py-3 font-medium">Schedule summary</th>
            <th className="px-4 py-3 font-medium">Compliance</th>
          </tr>
        </thead>
        <tbody>
          {roster.data.map((r) => {
            const status = complianceByName.get(r.fullName);
            return (
              <tr key={r.locationStaffId} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3">
                  <ClickableName id={r.locationStaffId} name={r.fullName} href={(id) => `/locations/${params.locationId}/staff/${id}`} />
                </td>
                {showClassification && <td className="px-4 py-3 text-gray-500">{r.classification?.toUpperCase()}</td>}
                <td className="px-4 py-3 text-gray-500">{scheduleSummary(r.schedule)}</td>
                <td className="px-4 py-3">
                  {status === 'overdue' ? (
                    <Pill tone="red">Overdue</Pill>
                  ) : status === 'needs_attention' ? (
                    <Pill tone="amber">Needs attention</Pill>
                  ) : (
                    <Pill tone="green">Compliant</Pill>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
