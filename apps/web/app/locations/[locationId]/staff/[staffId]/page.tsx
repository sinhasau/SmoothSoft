'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import { useRequireAuth } from '../../../../../lib/auth';
import { Button, Card, Pill } from '../../../../../components/ui';

interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface StaffDetail {
  locationStaffId: string;
  fullName: string;
  role: string;
  /** Omitted by the API for non-management roles — payroll-sensitive. */
  classification?: string;
  status: string;
  compensation: { commission_pct: string | null; booth_rent_weekly: string | null } | null;
  goals: { daily_revenue: string | null; clients_per_day: number | null } | null;
  schedule: ScheduleDay[];
}

interface ComplianceDocument {
  id: string;
  docType: string;
  description: string | null;
  expiresAt: string | null;
  status: 'valid' | 'needs_attention' | 'overdue';
  locationStaffId: string | null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? ':' + String(m).padStart(2, '0') : ''}${period}`;
}

export default function StaffDetailPage({ params }: { params: { locationId: string; staffId: string } }) {
  const auth = useRequireAuth();
  const queryClient = useQueryClient();
  const { data: roster } = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffDetail[]>('/settings/staff') });
  const person = roster?.find((r) => r.locationStaffId === params.staffId);

  const allDocs = useQuery({ queryKey: ['settings', 'compliance-documents'], queryFn: () => api.get<ComplianceDocument[]>('/settings/compliance-documents') });
  const docs = allDocs.data?.filter((d) => d.locationStaffId === params.staffId) ?? [];

  const [newDocType, setNewDocType] = useState('');
  const [newDocExpiry, setNewDocExpiry] = useState('');

  const invalidateDocs = () => void queryClient.invalidateQueries({ queryKey: ['settings', 'compliance-documents'] });

  const addDoc = useMutation({
    mutationFn: () => api.post(`/settings/staff/${params.staffId}/compliance-documents`, { docType: newDocType, expiresAt: newDocExpiry || null }),
    onSuccess: () => {
      setNewDocType('');
      setNewDocExpiry('');
      invalidateDocs();
    },
  });

  const updateDoc = useMutation({
    mutationFn: ({ id, ...dto }: { id: string; status?: ComplianceDocument['status']; expiresAt?: string | null }) =>
      api.put(`/settings/compliance-documents/${id}`, dto),
    onSuccess: invalidateDocs,
  });

  const removeDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/compliance-documents/${id}`),
    onSuccess: invalidateDocs,
  });

  if (!roster) return <p className="text-gray-500">Loading…</p>;
  if (!person) return <p className="text-gray-500">Staff member not found.</p>;
  const showClassification = auth?.role === 'org_owner' || auth?.role === 'location_manager';

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{person.fullName}</h2>
            <p className="text-sm text-gray-500">
              {person.role.replace('_', ' ')}
              {showClassification && person.classification ? ` · ${person.classification.toUpperCase()}` : ''}
            </p>
          </div>
          <span className={person.status === 'off' ? 'text-gray-400' : 'text-green-700'}>{person.status === 'off' ? 'Off today' : person.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Compensation</div>
            <div>
              {person.compensation?.commission_pct
                ? `${person.compensation.commission_pct}% commission`
                : person.compensation?.booth_rent_weekly
                  ? `$${person.compensation.booth_rent_weekly}/wk booth rent`
                  : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Goals</div>
            <div>
              {person.goals?.daily_revenue ? `$${person.goals.daily_revenue}/day` : '—'}
              {person.goals?.clients_per_day ? ` · ${person.goals.clients_per_day} clients/day` : ''}
            </div>
          </div>
        </div>
      </Card>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Weekly schedule</h3>
        <Card>
          {DAY_LABELS.map((label, dow) => {
            const shift = person.schedule.find((s) => s.day_of_week === dow);
            return (
              <div key={dow} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-2 text-sm">
                <span>{label}</span>
                {shift ? (
                  <span>
                    {fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}
                  </span>
                ) : (
                  <span className="text-gray-300">off</span>
                )}
              </div>
            );
          })}
        </Card>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Documents &amp; licenses</h3>
        <Card>
          {docs.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No documents on file.</p>}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{d.docType}</div>
                {d.description && <div className="text-gray-500">{d.description}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Pill tone={d.status === 'overdue' ? 'red' : d.status === 'needs_attention' ? 'amber' : 'green'}>{d.status.replace(/_/g, ' ')}</Pill>
                <input
                  type="date"
                  className="border border-black/15 rounded-lg px-2 py-1 text-sm"
                  defaultValue={d.expiresAt ?? ''}
                  onBlur={(e) => updateDoc.mutate({ id: d.id, expiresAt: e.target.value || null })}
                />
                {d.status !== 'valid' && <Button onClick={() => updateDoc.mutate({ id: d.id, status: 'valid' })}>Mark valid</Button>}
                <button className="text-gray-400 hover:text-red-600" onClick={() => removeDoc.mutate(d.id)} title="Remove">
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              className="border border-black/15 rounded-lg px-2 py-1 text-sm flex-1"
              placeholder="Document or license name"
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value)}
            />
            <input type="date" className="border border-black/15 rounded-lg px-2 py-1 text-sm" value={newDocExpiry} onChange={(e) => setNewDocExpiry(e.target.value)} />
            <Button variant="solid" onClick={() => addDoc.mutate()} disabled={!newDocType.trim()}>
              Add
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
