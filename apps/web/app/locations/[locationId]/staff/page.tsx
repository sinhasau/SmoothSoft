'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { useRequireAuth } from '../../../../lib/auth';
import { Button, Card, ClickableName, Pill } from '../../../../components/ui';
import { StaffOnboardingForm, type CustomJobRole, type CustomPayModel, type NewStaffPayload } from '../../../../components/staff-onboarding-form';

interface ScheduleDay {
  day_of_week: number;
}

interface StaffRosterRow {
  locationStaffId: string;
  fullName: string;
  role: string;
  jobRoleName: string | null;
  /** Omitted by the API for non-management roles — payroll-sensitive. */
  classification?: string;
  employmentStatus: 'active' | 'inactive' | 'resigned';
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
  const queryClient = useQueryClient();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const roster = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffRosterRow[]>('/settings/staff') });
  const dashboard = useQuery({ queryKey: ['dashboard', 'location', params.locationId], queryFn: () => api.get<LocationDashboard>('/dashboard/location') });
  const payModels = useQuery({ queryKey: ['settings', 'pay-models'], queryFn: () => api.get<CustomPayModel[]>('/settings/pay-models'), enabled: Boolean(auth && (auth.role === 'org_owner' || auth.role === 'location_manager')) });
  const jobRoles = useQuery({ queryKey: ['settings', 'job-roles'], queryFn: () => api.get<CustomJobRole[]>('/settings/job-roles'), enabled: Boolean(auth && (auth.role === 'org_owner' || auth.role === 'location_manager')) });
  const addStaff = useMutation({
    mutationFn: (payload: NewStaffPayload) => api.post('/settings/staff', payload),
    onSuccess: () => { setOnboardingOpen(false); setOnboardingError(null); void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }); },
    onError: (error) => setOnboardingError(error instanceof ApiError ? error.body?.message ?? 'Could not create this team member' : 'Could not create this team member'),
  });

  const complianceByName = new Map<string, string>();
  for (const c of dashboard.data?.compliance ?? []) {
    if (c.staffName) complianceByName.set(c.staffName, c.status);
  }

  if (!roster.data) return <p className="text-gray-500">Loading…</p>;
  const showClassification = auth?.role === 'org_owner' || auth?.role === 'location_manager';
  const groups = {
    active: roster.data.filter((person) => person.employmentStatus === 'active'),
    inactive: roster.data.filter((person) => person.employmentStatus === 'inactive'),
    resigned: roster.data.filter((person) => person.employmentStatus === 'resigned'),
  };

  const rosterTable = (people: StaffRosterRow[], empty: string) => <Card className="overflow-hidden">{people.length === 0 ? <p className="px-4 py-4 text-sm text-gray-400">{empty}</p> : <table className="w-full text-sm"><thead><tr className="border-b border-black/10 text-left text-gray-500"><th className="px-4 py-3 font-medium">Team member</th>{showClassification && <th className="px-4 py-3 font-medium">Classification</th>}<th className="px-4 py-3 font-medium">Regular schedule</th><th className="px-4 py-3 font-medium">Compliance</th></tr></thead><tbody>{people.map((person) => { const compliance = complianceByName.get(person.fullName); return <tr key={person.locationStaffId} className="border-b border-black/5 last:border-0"><td className="px-4 py-3"><ClickableName id={person.locationStaffId} name={person.fullName} href={(id) => `/locations/${params.locationId}/staff/${id}`} /></td>{showClassification && <td className="px-4 py-3 text-gray-500">{person.classification?.toUpperCase()}</td>}<td className="px-4 py-3 text-gray-500">{scheduleSummary(person.schedule)}</td><td className="px-4 py-3">{compliance === 'overdue' ? <Pill tone="red">Overdue</Pill> : compliance === 'needs_attention' ? <Pill tone="amber">Needs attention</Pill> : <Pill tone="green">Compliant</Pill>}</td></tr>; })}</tbody></table>}</Card>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4"><div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Your people</p><h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Team</h1><p className="mt-1 text-sm text-gray-500">Manage employment status, regular hours, pay, performance, and documents.</p></div>{showClassification && <Button variant="solid" onClick={() => setOnboardingOpen(true)}>Add team member</Button>}</div>
      <section><div className="mb-2 flex items-center gap-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active</h2><Pill tone="green">{groups.active.length}</Pill></div>{rosterTable(groups.active, 'No active employees.')}</section>
      <section><div className="mb-2 flex items-center gap-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inactive</h2><Pill tone="gray">{groups.inactive.length}</Pill></div>{rosterTable(groups.inactive, 'No inactive employees.')}</section>
      <details><summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Resigned <Pill tone="gray">{groups.resigned.length}</Pill><span className="ml-1 text-gray-300">▸</span></summary><div className="mt-2">{rosterTable(groups.resigned, 'No resigned employees.')}</div></details>
      {onboardingOpen && <StaffOnboardingForm pending={addStaff.isPending} error={onboardingError} payModels={payModels.data} jobRoles={jobRoles.data} onCancel={() => { setOnboardingOpen(false); setOnboardingError(null); }} onSubmit={(payload) => addStaff.mutate(payload)} />}
    </div>
  );
}
