'use client';

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
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
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GRID_DAYS = 365;
const GAP_ALERT_WINDOW_DAYS = 30;
const DEFAULT_SHIFT_START = '09:00';
const DEFAULT_SHIFT_END = '17:00';

// Date leads, day abbreviation trails: "07/19 Sat" — not "Sat 07/19".
function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd} ${DAY_LABELS[d.getDay()]}`;
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

  const grid = useQuery({ queryKey: ['schedule', 'grid', today], queryFn: () => api.get<Grid>(`/schedule/grid?startDate=${today}&days=${GRID_DAYS}`) });
  const requests = useQuery({ queryKey: ['schedule', 'requests'], queryFn: () => api.get<PendingRequest[]>('/schedule/requests') });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  }

  const approve = useMutation({
    mutationFn: ({ id, confirmed }: { id: string; confirmed?: boolean }) => api.post(`/schedule/requests/${id}/approve`, { confirmed }),
    onSuccess: invalidate,
  });
  const deny = useMutation({ mutationFn: (id: string) => api.post(`/schedule/requests/${id}/deny`), onSuccess: invalidate });

  // Rows annotated with a `monthHeader` the first time a given month
  // appears — a plain section header row for scanning a year of dates
  // (item 7), rather than a sticky/fixed element.
  const rowsWithMonthHeaders = useMemo(() => {
    if (!grid.data) return [];
    let lastMonth = '';
    return grid.data.rows.map((row) => {
      const d = new Date(row.date + 'T00:00:00');
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const monthHeader = monthKey !== lastMonth ? `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}` : null;
      lastMonth = monthKey;
      return { ...row, monthHeader };
    });
  }, [grid.data]);

  // Date-specific gap alerts (item 8) — coverage below minimum, within a
  // near-term CALENDAR window (not "first N gap rows", which for a
  // weekly-recurring gap like a chronically understaffed Sunday would
  // silently span months instead of the next few weeks).
  const gapAlerts = useMemo(() => {
    if (!grid.data) return [];
    return grid.data.rows
      .slice(0, GAP_ALERT_WINDOW_DAYS)
      .filter((r) => r.belowMinimum)
      .map((row) => {
        const offToday = row.entries.find((e) => !e.working && !e.pendingRequest);
        return offToday ? { date: row.date, dayOfWeek: row.dayOfWeek, staffId: offToday.staffId, fullName: offToday.fullName } : null;
      })
      .filter((g): g is { date: string; dayOfWeek: number; staffId: string; fullName: string } => g !== null);
  }, [grid.data]);

  if (!grid.data) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      {gapAlerts.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Scheduling help needed</h2>
          <Card>
            {gapAlerts.map((gap) => (
              <GapAlertRow key={gap.date} gap={gap} onDone={invalidate} />
            ))}
          </Card>
        </div>
      )}

      {/* 365-day grid, scrollable rather than paginated (item 7). */}
      <Card className="overflow-auto max-h-[600px]">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="sticky top-0 bg-white z-10">
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
            {rowsWithMonthHeaders.map((row) => (
              <Fragment key={row.date}>
                {row.monthHeader && (
                  <tr key={`month-${row.date}`} className="bg-gray-50">
                    <td colSpan={grid.data!.roster.length + 2} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {row.monthHeader}
                    </td>
                  </tr>
                )}
                <tr key={row.date} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Pending requests</h2>
        <Card>
          {(requests.data?.length ?? 0) === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No pending requests.</div>}
          {requests.data?.map((r) => (
            <PendingRequestRow key={r.id} request={r} onApprove={(confirmed) => approve.mutate({ id: r.id, confirmed })} onDeny={() => deny.mutate(r.id)} />
          ))}
        </Card>
      </div>
    </div>
  );
}

function PendingRequestRow({
  request: r,
  onApprove,
  onDeny,
}: {
  request: PendingRequest;
  onApprove: (confirmed?: boolean) => void;
  onDeny: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-b border-black/5 last:border-0 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">
            {r.fullName} — {r.requestType === 'one_time' ? (r.workDate ? fmtDate(r.workDate.slice(0, 10)) : '') : `every ${DAY_LABELS[r.dayOfWeek ?? 0]}`}
          </div>
          <div className="text-sm text-gray-500">
            {r.isWorking ? 'Wants to work' : 'Requesting off'} {r.reason ? `· ${r.reason}` : ''} · {r.requestType === 'recurring' ? 'recurring change' : 'one-off'}
          </div>
        </div>
        {!confirming && (
          <div className="flex gap-2">
            <Button
              variant="solid"
              onClick={() => {
                if (r.requestType === 'recurring') setConfirming(true);
                else onApprove();
              }}
            >
              Approve
            </Button>
            <Button onClick={onDeny}>Deny</Button>
          </div>
        )}
      </div>

      {/* Approving a recurring change requires a second explicit click,
          with a warning shown between them (item 10) — this changes the
          person's schedule every week, forever, not just once. */}
      {confirming && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700 mb-2">This changes {r.fullName}'s schedule every week, forever — not just this one time.</p>
          <div className="flex gap-2">
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="solid"
              onClick={() => {
                onApprove(true);
                setConfirming(false);
              }}
            >
              Confirm recurring change
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function GapAlertRow({
  gap,
  onDone,
}: {
  gap: { date: string; dayOfWeek: number; staffId: string; fullName: string };
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'default' | 'confirmingRecurring'>('default');

  // "Shift X here" applies immediately for just this date — a one-off
  // request that auto-approves in the same click, since one-off changes
  // don't need the two-click confirm (item 8/9). Submit-then-approve
  // reuses the existing single-request-at-a-time endpoints rather than
  // adding a second "create exception directly" API surface.
  const shiftOneOff = useMutation({
    mutationFn: async () => {
      const req = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: gap.staffId,
        requestType: 'one_time',
        workDate: gap.date,
        isWorking: true,
        startTime: DEFAULT_SHIFT_START,
        endTime: DEFAULT_SHIFT_END,
        reason: 'Coverage gap fill',
      });
      return api.post(`/schedule/requests/${req.id}/approve`, {});
    },
    onSuccess: onDone,
  });

  const shiftRecurring = useMutation({
    mutationFn: async () => {
      const req = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: gap.staffId,
        requestType: 'recurring',
        dayOfWeek: gap.dayOfWeek,
        isWorking: true,
        startTime: DEFAULT_SHIFT_START,
        endTime: DEFAULT_SHIFT_END,
        reason: 'Coverage gap fill — made recurring',
      });
      return api.post(`/schedule/requests/${req.id}/approve`, { confirmed: true });
    },
    onSuccess: onDone,
  });

  return (
    <div className="border-b border-black/5 last:border-0 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-red-600 font-medium">{fmtDate(gap.date)}</span>
          <span className="text-sm text-gray-500"> — below the minimum staffing level</span>
        </div>
        {mode === 'default' && (
          <div className="flex items-center gap-3">
            <Button variant="solid" onClick={() => shiftOneOff.mutate()} disabled={shiftOneOff.isPending}>
              Shift {gap.fullName} here — just {fmtDate(gap.date)}
            </Button>
            <button className="text-xs text-gray-400 underline hover:text-black" onClick={() => setMode('confirmingRecurring')}>
              Make it recurring instead
            </button>
          </div>
        )}
      </div>

      {mode === 'confirmingRecurring' && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700 mb-2">
            This adds {gap.fullName} to every future {DAY_LABELS[gap.dayOfWeek]}, not just {fmtDate(gap.date)}.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setMode('default')}>Cancel</Button>
            <Button variant="solid" onClick={() => shiftRecurring.mutate()} disabled={shiftRecurring.isPending}>
              Confirm recurring change
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
