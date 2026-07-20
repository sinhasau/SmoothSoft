'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { Button, Card } from '../../../../components/ui';

interface GridEntry {
  staffId: string;
  fullName: string;
  working: boolean;
  startTime: string | null;
  endTime: string | null;
  pendingRequest: { id: string; isWorking: boolean; reason: string | null } | null;
}

interface GridRow {
  date: string;
  dayOfWeek: number;
  entries: GridEntry[];
  coverageCount: number;
  belowMinimum: boolean;
}

interface Roster {
  staffId: string;
  fullName: string;
}

interface Grid {
  roster: Roster[];
  rows: GridRow[];
  minimumCoverage: number;
}

interface PendingRequest {
  id: string;
  fullName: string;
  requestType: 'one_time' | 'recurring';
  workDate: string | null;
  dayOfWeek: number | null;
  isWorking: boolean;
  reason: string | null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? ':' + String(m).padStart(2, '0') : ''}${period}`;
}

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const grid = useQuery({ queryKey: ['schedule', 'grid', today], queryFn: () => api.get<Grid>(`/schedule/grid?startDate=${today}&days=14`) });
  const requests = useQuery({ queryKey: ['schedule', 'requests'], queryFn: () => api.get<PendingRequest[]>('/schedule/requests') });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  }

  const approve = useMutation({
    mutationFn: ({ id, confirmed }: { id: string; confirmed?: boolean }) => api.post(`/schedule/requests/${id}/approve`, { confirmed }),
    onSuccess: invalidate,
    onError: (err, vars) => {
      if (err instanceof ApiError && err.body?.code === 'RECURRING_CHANGE_NEEDS_CONFIRMATION') {
        if (confirm(`${err.body.message}\n\nApply as a standing recurring change?`)) {
          approve.mutate({ id: vars.id, confirmed: true });
        }
      }
    },
  });

  const deny = useMutation({ mutationFn: (id: string) => api.post(`/schedule/requests/${id}/deny`), onSuccess: invalidate });

  if (!grid.data) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-gray-500 border-b border-black/10">
              <th className="px-4 py-3 font-medium">Date</th>
              {grid.data.roster.map((r) => (
                <th key={r.staffId} className="px-4 py-3 font-medium">
                  {r.fullName}
                </th>
              ))}
              <th className="px-4 py-3 font-medium">Cov.</th>
            </tr>
          </thead>
          <tbody>
            {grid.data.rows.map((row) => (
              <tr key={row.date} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-medium">
                  {fmtDate(row.date)} {row.date === today && <span className="text-blue-600 text-xs">today</span>}
                </td>
                {row.entries.map((e) => (
                  <td key={e.staffId} className="px-4 py-3">
                    {e.pendingRequest ? (
                      <span className="text-amber-700">requested {e.pendingRequest.isWorking ? 'change' : 'off'}</span>
                    ) : e.working ? (
                      <span>
                        {fmtTime(e.startTime)}–{fmtTime(e.endTime)}
                      </span>
                    ) : (
                      <span className="text-gray-300">off</span>
                    )}
                  </td>
                ))}
                <td className={`px-4 py-3 font-semibold ${row.belowMinimum ? 'text-red-600' : 'text-green-700'}`}>{row.coverageCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Pending requests</h2>
        <Card>
          {(requests.data?.length ?? 0) === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No pending requests.</div>}
          {requests.data?.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3">
              <div>
                <div className="font-medium">
                  {r.fullName} — {r.requestType === 'one_time' ? `${r.workDate ? fmtDate(r.workDate.slice(0, 10)) : ''}` : `every ${DAY_LABELS[r.dayOfWeek ?? 0]}`}
                </div>
                <div className="text-sm text-gray-500">
                  {r.isWorking ? 'Wants to work' : 'Requesting off'} {r.reason ? `· ${r.reason}` : ''} · {r.requestType === 'recurring' ? 'recurring change' : 'one-off'}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="solid" onClick={() => approve.mutate({ id: r.id })}>
                  Approve
                </Button>
                <Button onClick={() => deny.mutate(r.id)}>Deny</Button>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
