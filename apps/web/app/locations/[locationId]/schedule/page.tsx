'use client';

import { useMemo, useState } from 'react';
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

interface GapInfo {
  date: string;
  dayOfWeek: number;
  staffId: string;
  fullName: string;
}

interface StoreHoursDay {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GRID_DAYS = 365;
const GAP_ALERT_WINDOW_DAYS = 30;
const DEFAULT_SHIFT_START = '09:00';
const DEFAULT_SHIFT_END = '17:00';

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// A closed day still needs *some* scale so a shift scheduled on it (unusual, but
// possible — a holiday overtime shift) doesn't divide by zero.
const FALLBACK_SCALE = { start: timeToMinutes('08:00'), end: timeToMinutes('20:00') };

// Date leads, day abbreviation trails: "07/19 Sat".
function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd} ${DAY_LABELS[d.getDay()]}`;
}

function fmtDateShort(dateStr: string) {
  return fmtDate(dateStr).slice(0, 5);
}

// Compact single-line shift range matching the reference mockup: "9–5", "10–6", "9:30–5".
function fmtShiftRange(start: string | null, end: string | null) {
  if (!start || !end) return '';
  const hour = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const hr = h % 12 === 0 ? 12 : h % 12;
    return m ? `${hr}:${String(m).padStart(2, '0')}` : `${hr}`;
  };
  return `${hour(start)}–${hour(end)}`;
}

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [dismissedGaps, setDismissedGaps] = useState<string[]>([]);

  const grid = useQuery({ queryKey: ['schedule', 'grid', today], queryFn: () => api.get<Grid>(`/schedule/grid?startDate=${today}&days=${GRID_DAYS}`) });
  const requests = useQuery({ queryKey: ['schedule', 'requests'], queryFn: () => api.get<PendingRequest[]>('/schedule/requests') });
  const storeHours = useQuery({ queryKey: ['settings', 'store-hours'], queryFn: () => api.get<StoreHoursDay[]>('/settings/store-hours') });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  }

  const approve = useMutation({
    mutationFn: ({ id, confirmed }: { id: string; confirmed?: boolean }) => api.post(`/schedule/requests/${id}/approve`, { confirmed }),
    onSuccess: invalidate,
  });
  const deny = useMutation({ mutationFn: (id: string) => api.post(`/schedule/requests/${id}/deny`), onSuccess: invalidate });

  // Dates become columns now (transposed from the old date-as-rows layout) — a
  // divider row doesn't translate, so a new month just gets a left border seam
  // on its first column instead.
  const columnsWithMonthSeam = useMemo(() => {
    if (!grid.data) return [];
    let lastMonth = '';
    return grid.data.rows.map((row) => {
      const d = new Date(row.date + 'T00:00:00');
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const isNewMonth = monthKey !== lastMonth && lastMonth !== '';
      lastMonth = monthKey;
      return { ...row, isNewMonth };
    });
  }, [grid.data]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, Map<string, GridEntry>>();
    for (const row of grid.data?.rows ?? []) {
      map.set(row.date, new Map(row.entries.map((e) => [e.staffId, e])));
    }
    return map;
  }, [grid.data]);

  const storeHoursByDow = useMemo(() => new Map((storeHours.data ?? []).map((h) => [h.day_of_week, h])), [storeHours.data]);

  function scaleForDow(dow: number) {
    const h = storeHoursByDow.get(dow);
    if (h?.is_open && h.open_time && h.close_time) return { start: timeToMinutes(h.open_time), end: timeToMinutes(h.close_time) };
    return FALLBACK_SCALE;
  }

  // Gap alerts for the next 30 calendar days, then split: a weekday that
  // keeps recurring below minimum collapses into ONE prompt recommending a
  // recurring fix; true one-offs stay as individual date rows.
  const { recurringGaps, singleGaps } = useMemo(() => {
    const empty = { recurringGaps: [] as { dayOfWeek: number; gaps: GapInfo[] }[], singleGaps: [] as GapInfo[] };
    if (!grid.data) return empty;

    const all: GapInfo[] = grid.data.rows
      .slice(0, GAP_ALERT_WINDOW_DAYS)
      .filter((r) => r.belowMinimum)
      .map((row) => {
        const offToday = row.entries.find((e) => !e.working && !e.pendingRequest);
        return offToday ? { date: row.date, dayOfWeek: row.dayOfWeek, staffId: offToday.staffId, fullName: offToday.fullName } : null;
      })
      .filter((g): g is GapInfo => g !== null);

    const byDow = new Map<number, GapInfo[]>();
    for (const g of all) {
      if (!byDow.has(g.dayOfWeek)) byDow.set(g.dayOfWeek, []);
      byDow.get(g.dayOfWeek)!.push(g);
    }

    const recurring: { dayOfWeek: number; gaps: GapInfo[] }[] = [];
    const singles: GapInfo[] = [];
    for (const [dayOfWeek, gaps] of byDow) {
      if (gaps.length >= 2) recurring.push({ dayOfWeek, gaps });
      else singles.push(gaps[0]);
    }
    return { recurringGaps: recurring, singleGaps: singles };
  }, [grid.data]);

  const visibleRecurring = recurringGaps.filter((r) => !dismissedGaps.includes(`dow-${r.dayOfWeek}`));
  const visibleSingles = singleGaps.filter((s) => !dismissedGaps.includes(`date-${s.date}`));

  if (!grid.data) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      {(visibleRecurring.length > 0 || visibleSingles.length > 0) && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Scheduling help needed</h2>
          <Card>
            {visibleRecurring.map((r) => (
              <RecurringGapRow
                key={`dow-${r.dayOfWeek}`}
                dayOfWeek={r.dayOfWeek}
                gaps={r.gaps}
                onDone={invalidate}
                onDismiss={() => setDismissedGaps((d) => [...d, `dow-${r.dayOfWeek}`])}
              />
            ))}
            {visibleSingles.map((gap) => (
              <SingleGapRow key={gap.date} gap={gap} onDone={invalidate} onDismiss={() => setDismissedGaps((d) => [...d, `date-${gap.date}`])} />
            ))}
          </Card>
        </div>
      )}

      {/* Transposed Gantt-style grid: staff are rows, dates are columns, shifts
          render as bars positioned by time-of-day against that weekday's store
          hours. Date-header row, store-hours row, and the staff-name column
          all stay frozen while scrolling through the full 365-day range. */}
      <Card className="overflow-auto max-h-[560px] bg-white">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 h-9 border-b border-black/10 bg-white px-4 text-left font-medium text-gray-500 whitespace-nowrap">
                Staff
              </th>
              {columnsWithMonthSeam.map((row) => (
                <th
                  key={row.date}
                  className={`sticky top-0 z-20 h-9 w-16 border-b border-black/10 px-1 text-center align-middle font-medium text-gray-500 ${
                    row.date === today ? 'bg-[#f3f7fd]' : 'bg-white'
                  } ${row.isNewMonth ? 'border-l border-black/10' : ''}`}
                >
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px]">{fmtDateShort(row.date)}</span>
                    <span className="text-[9px] text-gray-400">{DAY_LABELS[row.dayOfWeek]}</span>
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 top-9 z-30 h-11 border-b border-black/10 bg-white px-4 text-left align-middle text-[10px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                Store hours
              </th>
              {columnsWithMonthSeam.map((row) => {
                const hours = storeHoursByDow.get(row.dayOfWeek);
                const open = hours?.is_open && hours.open_time && hours.close_time;
                return (
                  <th
                    key={row.date}
                    className={`sticky top-9 z-20 h-11 w-16 border-b border-black/10 px-1 align-middle ${
                      row.date === today ? 'bg-[#f3f7fd]' : 'bg-white'
                    } ${row.isNewMonth ? 'border-l border-black/10' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {open ? (
                        <div
                          className="h-2.5 w-full rounded bg-gray-300"
                          title={`Open ${fmtShiftRange(hours!.open_time, hours!.close_time)}`}
                        />
                      ) : (
                        <div className="h-2.5 w-full rounded bg-gray-50" title="Closed" />
                      )}
                      <span className={`text-[10px] font-semibold ${row.belowMinimum ? 'text-red-600' : 'text-green-700'}`}>{row.coverageCount}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.data.roster.map((person) => (
              <tr key={person.staffId}>
                <td className="sticky left-0 z-10 border-b border-black/5 bg-white px-4 py-2 font-medium whitespace-nowrap">{person.fullName}</td>
                {columnsWithMonthSeam.map((row) => {
                  const entry = entriesByDate.get(row.date)?.get(person.staffId);
                  const scale = scaleForDow(row.dayOfWeek);
                  const span = scale.end - scale.start;
                  const pending = !!entry?.pendingRequest;
                  const working = !!entry?.working && !!entry.startTime && !!entry.endTime;
                  let bar: React.ReactNode = null;
                  if (pending) {
                    bar = <div className="absolute inset-y-0 inset-x-0.5 rounded border border-dashed border-amber-400 bg-amber-50" title="Requested off" />;
                  } else if (working) {
                    const left = Math.max(0, ((timeToMinutes(entry!.startTime!) - scale.start) / span) * 100);
                    const width = Math.max(8, Math.min(100 - left, ((timeToMinutes(entry!.endTime!) - timeToMinutes(entry!.startTime!)) / span) * 100));
                    bar = (
                      <div
                        className="absolute inset-y-0 rounded bg-blue-500"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={fmtShiftRange(entry!.startTime, entry!.endTime)}
                      />
                    );
                  }
                  return (
                    <td
                      key={row.date}
                      className={`border-b border-black/5 px-1 py-2 w-16 ${row.date === today ? 'bg-[#f3f7fd]' : ''} ${row.isNewMonth ? 'border-l border-black/10' : ''}`}
                    >
                      <div className="relative h-5 rounded bg-gray-100">{bar}</div>
                    </td>
                  );
                })}
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
            <PendingRequestRow key={r.id} request={r} onApprove={(confirmed) => approve.mutate({ id: r.id, confirmed })} onDeny={() => deny.mutate(r.id)} />
          ))}
        </Card>
      </div>

      <EmployeeRequestExample roster={grid.data.roster} onSubmitted={invalidate} />
    </div>
  );
}

/** Submits a one-off coverage fix and approves it in the same click (one-offs don't need the two-click confirm). */
function useShiftHere(onDone: () => void) {
  return useMutation({
    mutationFn: async ({ staffId, date }: { staffId: string; date: string }) => {
      const req = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: staffId,
        requestType: 'one_time',
        workDate: date,
        isWorking: true,
        startTime: DEFAULT_SHIFT_START,
        endTime: DEFAULT_SHIFT_END,
        reason: 'Coverage gap fill',
      });
      return api.post(`/schedule/requests/${req.id}/approve`, {});
    },
    onSuccess: onDone,
  });
}

function useShiftRecurring(onDone: () => void) {
  return useMutation({
    mutationFn: async ({ staffId, dayOfWeek }: { staffId: string; dayOfWeek: number }) => {
      const req = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: staffId,
        requestType: 'recurring',
        dayOfWeek,
        isWorking: true,
        startTime: DEFAULT_SHIFT_START,
        endTime: DEFAULT_SHIFT_END,
        reason: 'Coverage gap fill — made recurring',
      });
      return api.post(`/schedule/requests/${req.id}/approve`, { confirmed: true });
    },
    onSuccess: onDone,
  });
}

/**
 * A weekday that's repeatedly below minimum gets ONE combined prompt:
 * recommended recurring fix (still gated by an inline confirm, since it
 * rewrites the weekly pattern), a one-time-only fix for the next date, or
 * ✕ to dismiss the line.
 */
function RecurringGapRow({
  dayOfWeek,
  gaps,
  onDone,
  onDismiss,
}: {
  dayOfWeek: number;
  gaps: GapInfo[];
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const shiftOneOff = useShiftHere(onDone);
  const shiftRecurring = useShiftRecurring(onDone);
  const next = gaps[0];
  const dates = gaps.map((g) => fmtDateShort(g.date));

  return (
    <div className="border-b border-black/5 px-4 py-3 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="font-medium text-red-600">Recurring gap</span>
          <span className="text-sm text-gray-600">
            {' '}
            — {DAY_LABELS_FULL[dayOfWeek]}s are repeatedly below minimum staffing ({dates.slice(0, 3).join(', ')}
            {dates.length > 3 ? '…' : ''})
          </span>
        </div>
        {!confirming && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="solid" onClick={() => setConfirming(true)} disabled={shiftRecurring.isPending}>
              Fix every {DAY_LABELS[dayOfWeek]} — add {next.fullName}
            </Button>
            <Button onClick={() => shiftOneOff.mutate({ staffId: next.staffId, date: next.date })} disabled={shiftOneOff.isPending}>
              Just {fmtDateShort(next.date)}
            </Button>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 hover:text-black" onClick={onDismiss}>
              ✕
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="mb-2 text-sm text-red-700">
            This adds {next.fullName} to every future {DAY_LABELS_FULL[dayOfWeek]} — the recurring weekly pattern, not just these dates.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="solid"
              onClick={() => {
                shiftRecurring.mutate({ staffId: next.staffId, dayOfWeek });
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

function SingleGapRow({ gap, onDone, onDismiss }: { gap: GapInfo; onDone: () => void; onDismiss: () => void }) {
  const shiftOneOff = useShiftHere(onDone);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 px-4 py-3 last:border-0">
      <div className="min-w-0">
        <span className="font-medium text-red-600">{fmtDate(gap.date)}</span>
        <span className="text-sm text-gray-500"> — below the minimum staffing level</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="solid" onClick={() => shiftOneOff.mutate({ staffId: gap.staffId, date: gap.date })} disabled={shiftOneOff.isPending}>
          Shift {gap.fullName} here — just {fmtDateShort(gap.date)}
        </Button>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 hover:text-black" onClick={onDismiss}>
          ✕
        </button>
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

/**
 * Shows what the employee-side request experience looks like — framed as
 * "Requesting as [name]" — and pushes a real entry into the Pending
 * requests list above via the same endpoint a staff member's own app
 * would call.
 */
function EmployeeRequestExample({ roster, onSubmitted }: { roster: Roster[]; onSubmitted: () => void }) {
  const [staffId, setStaffId] = useState(roster[0]?.staffId ?? '');
  const [requestType, setRequestType] = useState<'one_time' | 'recurring'>('one_time');
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/schedule/requests', {
        locationStaffId: staffId,
        requestType,
        workDate: requestType === 'one_time' ? workDate : undefined,
        dayOfWeek: requestType === 'recurring' ? dayOfWeek : undefined,
        isWorking: false,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      setReason('');
      setSubmitted(true);
      onSubmitted();
      setTimeout(() => setSubmitted(false), 3000);
    },
  });

  const requestingAs = roster.find((r) => r.staffId === staffId)?.fullName ?? '';

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Employee request example</h2>
      <Card className="p-4">
        <p className="text-sm text-gray-500 mb-3">Requesting as {requestingAs || '—'}</p>

        <select className="w-full border border-black/15 rounded-lg px-3 py-2 mb-2 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          {roster.map((r) => (
            <option key={r.staffId} value={r.staffId}>
              {r.fullName}
            </option>
          ))}
        </select>

        <div className="flex gap-2 mb-2">
          <Button variant={requestType === 'one_time' ? 'solid' : 'default'} onClick={() => setRequestType('one_time')}>
            One-time
          </Button>
          <Button variant={requestType === 'recurring' ? 'solid' : 'default'} onClick={() => setRequestType('recurring')}>
            Recurring
          </Button>
        </div>

        {requestType === 'one_time' ? (
          <input type="date" className="w-full border border-black/15 rounded-lg px-3 py-2 mb-2" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        ) : (
          <select className="w-full border border-black/15 rounded-lg px-3 py-2 mb-2 text-sm" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {DAY_LABELS.map((label, i) => (
              <option key={i} value={i}>
                Every {label}
              </option>
            ))}
          </select>
        )}

        <input
          className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={() => submit.mutate()} disabled={!staffId || submit.isPending}>
            Submit
          </Button>
          {submitted && <span className="text-sm text-green-700">Request submitted — now in Pending requests above.</span>}
        </div>
      </Card>
    </div>
  );
}
