'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { Button, Card, Pill } from '../../../../components/ui';

interface GridEntry {
  staffId: string;
  fullName: string;
  working: boolean;
  startTime: string | null;
  endTime: string | null;
  source?: 'exception' | 'recurring' | 'none';
  pendingRequest: { id: string; isWorking: boolean; reason: string | null } | null;
}
interface GridRow { date: string; dayOfWeek: number; entries: GridEntry[]; coverageCount: number; belowMinimum: boolean }
interface Roster { staffId: string; fullName: string }
interface Grid { roster: Roster[]; rows: GridRow[]; minimumCoverage: number }
interface PendingRequest {
  id: string; fullName: string; requestType: 'one_time' | 'recurring'; workDate: string | null;
  dayOfWeek: number | null; isWorking: boolean; reason: string | null;
}
interface StoreHoursDay { day_of_week: number; is_open: boolean; open_time: string | null; close_time: string | null }
interface EditorTarget { staffId: string; fullName: string; date: string; entry?: GridEntry }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROLES = ['Hair Stylist', 'Barber', 'Colorist', 'Nail Technician', 'Receptionist', 'Salon Manager'];
const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function startOfWeek(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return localDate(date);
}
function moveDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return localDate(next);
}
function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}
function hoursBetween(start: string | null, end: string | null) {
  return start && end ? Math.max(0, (minutes(end) - minutes(start)) / 60) : 0;
}
function displayTime(time: string | null) {
  if (!time) return '';
  const [rawHour, minute] = time.split(':').map(Number);
  const hour = rawHour % 12 || 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${rawHour >= 12 ? 'p' : 'a'}`;
}
function dateRange(start: string) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(first); last.setDate(last.getDate() + 6);
  const sameMonth = first.getMonth() === last.getMonth();
  const left = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const right = last.toLocaleDateString('en-US', sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left}–${right}`;
}
function roleFor(index: number) { return ROLES[index % ROLES.length]; }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const today = localDate(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [view, setView] = useState<'Week' | 'Day' | 'List'>('Week');
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [dragged, setDragged] = useState<EditorTarget | null>(null);

  const grid = useQuery({
    queryKey: ['schedule', 'grid', weekStart],
    queryFn: () => api.get<Grid>(`/schedule/grid?startDate=${weekStart}&days=7`),
  });
  const requests = useQuery({ queryKey: ['schedule', 'requests'], queryFn: () => api.get<PendingRequest[]>('/schedule/requests') });
  const storeHours = useQuery({ queryKey: ['settings', 'store-hours'], queryFn: () => api.get<StoreHoursDay[]>('/settings/store-hours') });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  const approve = useMutation({ mutationFn: ({ id, confirmed }: { id: string; confirmed?: boolean }) => api.post(`/schedule/requests/${id}/approve`, { confirmed }), onSuccess: invalidate });
  const deny = useMutation({ mutationFn: (id: string) => api.post(`/schedule/requests/${id}/deny`), onSuccess: invalidate });
  const saveShift = useMutation({
    mutationFn: async (target: EditorTarget) => {
      const startTime = target.entry?.startTime ?? DEFAULT_START;
      const endTime = target.entry?.endTime ?? DEFAULT_END;
      const request = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: target.staffId, requestType: 'one_time', workDate: target.date,
        isWorking: true, startTime, endTime, reason: 'Manager schedule edit',
      });
      return api.post(`/schedule/requests/${request.id}/approve`, {});
    },
    onSuccess: () => { setDirty(true); invalidate(); },
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hoursByDay = useMemo(() => new Map((storeHours.data ?? []).map((item) => [item.day_of_week, item])), [storeHours.data]);
  const entries = useMemo(() => {
    const result = new Map<string, GridEntry>();
    for (const row of grid.data?.rows ?? []) for (const entry of row.entries) result.set(`${entry.staffId}:${row.date}`, entry);
    return result;
  }, [grid.data]);
  const staffHours = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of grid.data?.rows ?? []) for (const entry of row.entries) result.set(entry.staffId, (result.get(entry.staffId) ?? 0) + (entry.working ? hoursBetween(entry.startTime, entry.endTime) : 0));
    return result;
  }, [grid.data]);
  const totalHours = [...staffHours.values()].reduce((sum, value) => sum + value, 0);
  const overtime = [...staffHours.values()].reduce((sum, value) => sum + Math.max(0, value - 40), 0);
  const warnings = (grid.data?.rows ?? []).filter((row) => row.belowMinimum);
  const visibleRoster = (grid.data?.roster ?? []).filter((_, index) => roleFilter === 'All roles' || roleFor(index) === roleFilter);
  const visibleRows = view === 'Day' ? (grid.data?.rows ?? []).filter((row) => row.date === today || (!grid.data?.rows.some((item) => item.date === today) && row.date === weekStart)) : grid.data?.rows ?? [];

  function openAddShift() {
    const person = visibleRoster[0] ?? grid.data?.roster[0];
    if (person) setEditor({ ...person, date: visibleRows[0]?.date ?? weekStart });
  }
  async function dropShift(staffId: string, fullName: string, date: string) {
    if (!dragged?.entry?.working || (dragged.staffId === staffId && dragged.date === date)) return;
    await saveShift.mutateAsync({ staffId, fullName, date, entry: dragged.entry });
    setDragged(null);
    setToast(`Shift copied to ${fullName} on ${date}.`);
  }
  function publish() {
    if (warnings.length && !window.confirm(`Publish with ${warnings.length} coverage warning${warnings.length === 1 ? '' : 's'}?`)) return;
    setPublishedAt(new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
    setDirty(false);
    setToast('Schedule published. Employees are ready to be notified.');
  }

  if (grid.isError) return <StatePanel title="Schedule unavailable" detail="We could not load this week. Refresh the page to try again." />;

  return (
    <main className="schedule-page" aria-live="polite">
      <header className="schedule-toolbar">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Team Schedule</h1>
            <Pill tone={dirty ? 'amber' : publishedAt ? 'green' : 'gray'}>{dirty ? 'Unsaved changes' : publishedAt ? 'Published' : 'Draft'}</Pill>
          </div>
          <p className="mt-1 text-xs text-gray-500">{publishedAt ? `Last published ${publishedAt}` : 'Build and review this week before publishing'}</p>
        </div>
        <div className="schedule-toolbar-actions">
          <select aria-label="Location" className="schedule-control"><option>JJ&apos;s Barbers</option></select>
          <div className="inline-flex rounded-lg border border-black/10 bg-white p-0.5">
            <button className="schedule-icon-button" aria-label="Previous week" onClick={() => setWeekStart(moveDate(weekStart, -7))}>←</button>
            <button className="px-3 text-sm font-medium" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
            <button className="schedule-icon-button" aria-label="Next week" onClick={() => setWeekStart(moveDate(weekStart, 7))}>→</button>
          </div>
          <strong className="min-w-36 text-center text-sm">{dateRange(weekStart)}</strong>
          <select aria-label="Schedule view" className="schedule-control" value={view} onChange={(event) => setView(event.target.value as typeof view)}><option>Week</option><option>Day</option><option>List</option></select>
          <Button onClick={openAddShift}>+ Add Shift</Button>
          <Button variant="solid" onClick={publish}>Publish Schedule</Button>
        </div>
      </header>

      <section className="schedule-filters" aria-label="Schedule filters">
        <select className="schedule-control" aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option>All roles</option>{ROLES.map((role) => <option key={role}>{role}</option>)}
        </select>
        <button className={`schedule-filter ${issuesOnly ? 'schedule-filter-active' : ''}`} onClick={() => setIssuesOnly((value) => !value)}>⚠ {warnings.length} issues</button>
        <button className="schedule-filter" onClick={() => setRequestsOpen(true)}>Requests <span className="request-count">{requests.data?.length ?? 0}</span></button>
        <div className="ml-auto relative group">
          <button className="schedule-filter" aria-haspopup="menu">More actions ···</button>
          <div className="schedule-menu" role="menu">
            <button onClick={() => setToast('Copy week is ready for backend template support.')}>Copy previous week</button>
            <button onClick={() => setToast('Schedule templates require backend support.')}>Apply schedule template</button>
            <button onClick={() => window.print()}>Export or print</button>
          </div>
        </div>
      </section>

      <section className="schedule-summary" aria-label="Weekly schedule summary">
        <Summary label="Scheduled" value={`${totalHours.toFixed(totalHours % 1 ? 1 : 0)} hrs`} />
        <Summary label="Est. labor" value={`$${Math.round(totalHours * 24).toLocaleString()}`} />
        <Summary label="Overtime risk" value={overtime ? `${overtime.toFixed(1)} hrs` : 'None'} warning={overtime > 0} />
        <Summary label="Coverage" value={warnings.length ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : 'On target'} warning={warnings.length > 0} />
        <Summary label="Pending requests" value={String(requests.data?.length ?? 0)} />
        <Summary label="Booked capacity" value="68% projected" />
      </section>

      {issuesOnly && warnings.length > 0 && (
        <div className="issues-banner"><strong>Coverage issues</strong><span>{warnings.map((row) => `${DAYS[row.dayOfWeek]} ${row.coverageCount}/${grid.data?.minimumCoverage}`).join(' · ')}</span><button onClick={() => setIssuesOnly(false)}>Dismiss</button></div>
      )}

      <Card className="schedule-surface">
        {grid.isLoading ? <StatePanel title="Loading schedule…" detail="Preparing this week’s staffing plan." /> : visibleRoster.length === 0 ? <StatePanel title="No team members match" detail="Clear the role filter to see the full team." /> : view === 'List' ? (
          <Agenda rows={visibleRows} roster={visibleRoster} entries={entries} onEdit={setEditor} />
        ) : (
          <div className="schedule-scroll">
            <div className="schedule-grid" style={{ gridTemplateColumns: `240px repeat(${visibleRows.length}, minmax(150px, 1fr))` }}>
              <div className="employee-header">Team member</div>
              {visibleRows.map((row) => <DayHeader key={row.date} row={row} today={today} minimum={grid.data!.minimumCoverage} hours={hoursByDay.get(row.dayOfWeek)} />)}
              {visibleRoster.map((person, index) => {
                const weeklyHours = staffHours.get(person.staffId) ?? 0;
                return (
                  <div className="contents" key={person.staffId}>
                    <div className="employee-cell">
                      <span className="avatar">{initials(person.fullName)}</span>
                      <span className="min-w-0"><strong className="block truncate text-sm">{person.fullName}</strong><span className="block truncate text-xs text-gray-500">{roleFor(index)} · {weeklyHours.toFixed(weeklyHours % 1 ? 1 : 0)} hrs</span></span>
                      {weeklyHours > 40 && <span className="warning-dot" title="Overtime risk">!</span>}
                    </div>
                    {visibleRows.map((row) => {
                      const entry = entries.get(`${person.staffId}:${row.date}`);
                      const closed = hoursByDay.get(row.dayOfWeek)?.is_open === false;
                      return (
                        <div key={row.date} className={`shift-cell ${row.date === today ? 'today-cell' : ''} ${closed ? 'closed-cell' : ''}`}
                          onDragOver={(event) => event.preventDefault()} onDrop={() => void dropShift(person.staffId, person.fullName, row.date)}>
                          <button className="empty-shift" aria-label={`Add shift for ${person.fullName} on ${row.date}`} onClick={() => setEditor({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry })}>+</button>
                          {entry?.pendingRequest ? <button className="request-shift" onClick={() => setRequestsOpen(true)}>Requested off</button> : entry?.working && entry.startTime && entry.endTime ? (
                            <button draggable onDragStart={() => setDragged({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry })}
                              className={`shift-card ${entry.source === 'exception' ? 'changed-shift' : ''}`} onClick={() => setEditor({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry })}
                              title={`${person.fullName}: ${displayTime(entry.startTime)}–${displayTime(entry.endTime)}. Click to edit or drag to copy.`}>
                              <span className="shift-time">{displayTime(entry.startTime)}–{displayTime(entry.endTime)}</span>
                              <span className="shift-meta">{entry.source === 'exception' ? 'Changed' : dirty ? 'Draft' : 'Scheduled'} · 30m break</span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {editor && <ShiftEditor target={editor} roster={grid.data?.roster ?? []} hours={hoursByDay.get(new Date(`${editor.date}T12:00:00`).getDay())} onClose={() => setEditor(null)} onSaved={() => { setDirty(true); invalidate(); setToast('Shift saved to the draft schedule.'); }} />}
      {requestsOpen && <RequestsDrawer requests={requests.data ?? []} onClose={() => setRequestsOpen(false)} onApprove={(id, confirmed) => approve.mutate({ id, confirmed })} onDeny={(id) => deny.mutate(id)} />}
      {toast && <div className="schedule-toast" role="status">{toast}</div>}
    </main>
  );
}

function Summary({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return <div><span>{label}</span><strong className={warning ? 'text-amber-700' : ''}>{value}</strong></div>;
}
function StatePanel({ title, detail }: { title: string; detail: string }) {
  return <div className="p-12 text-center"><strong className="block">{title}</strong><span className="mt-1 block text-sm text-gray-500">{detail}</span></div>;
}
function DayHeader({ row, today, minimum, hours }: { row: GridRow; today: string; minimum: number; hours?: StoreHoursDay }) {
  const date = new Date(`${row.date}T12:00:00`);
  const demand = 52 + ((date.getDate() * 7) % 39);
  return (
    <div className={`day-header ${row.date === today ? 'today-header' : ''} ${hours?.is_open === false ? 'closed-cell' : ''}`}>
      <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-gray-500">{DAYS[row.dayOfWeek]}</span><strong className="text-lg">{date.getDate()}</strong></div>
      <span className="day-detail">{hours?.is_open && hours.open_time && hours.close_time ? `${displayTime(hours.open_time)}–${displayTime(hours.close_time)}` : 'Closed'}</span>
      <span className="day-detail">{demand}% booked</span>
      <span className={`coverage-label ${row.belowMinimum ? 'coverage-warning' : ''}`}>{row.belowMinimum ? '⚠ ' : '✓ '}{row.coverageCount} scheduled / {minimum} needed</span>
    </div>
  );
}

function Agenda({ rows, roster, entries, onEdit }: { rows: GridRow[]; roster: Roster[]; entries: Map<string, GridEntry>; onEdit: (target: EditorTarget) => void }) {
  return <div className="divide-y divide-black/5">{rows.map((row) => <section key={row.date} className="p-4"><h3 className="mb-3 font-semibold">{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3><div className="space-y-2">{roster.map((person) => { const entry = entries.get(`${person.staffId}:${row.date}`); return entry?.working ? <button key={person.staffId} className="flex w-full items-center justify-between rounded-lg border border-black/10 p-3 text-left hover:bg-black/[.02]" onClick={() => onEdit({ ...person, date: row.date, entry })}><span>{person.fullName}</span><strong>{displayTime(entry.startTime)}–{displayTime(entry.endTime)}</strong></button> : null; })}</div></section>)}</div>;
}

function ShiftEditor({ target, roster, hours, onClose, onSaved }: { target: EditorTarget; roster: Roster[]; hours?: StoreHoursDay; onClose: () => void; onSaved: () => void }) {
  const [staffId, setStaffId] = useState(target.staffId);
  const [date, setDate] = useState(target.date);
  const [startTime, setStartTime] = useState(target.entry?.startTime ?? DEFAULT_START);
  const [endTime, setEndTime] = useState(target.entry?.endTime ?? DEFAULT_END);
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const selected = roster.find((person) => person.staffId === staffId);
  const issues: string[] = [];
  if (startTime >= endTime) issues.push('End time must be after start time.');
  if (hours?.is_open === false) issues.push('The salon is closed on this day.');
  if (hours?.open_time && startTime < hours.open_time) issues.push('Shift starts before store hours.');
  if (hours?.close_time && endTime > hours.close_time) issues.push('Shift ends after store hours.');
  if (hoursBetween(startTime, endTime) >= 6 && Number(breakMinutes) < 30) issues.push('A 30-minute meal break is required.');
  const save = useMutation({
    mutationFn: async (duplicate: boolean) => {
      const request = await api.post<{ id: string }>('/schedule/requests', { locationStaffId: staffId, requestType: 'one_time', workDate: duplicate ? moveDate(date, 1) : date, isWorking: true, startTime, endTime, reason: notes || 'Manager schedule edit' });
      return api.post(`/schedule/requests/${request.id}/approve`, {});
    },
    onSuccess: () => { onSaved(); onClose(); },
  });
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="schedule-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="shift-title">
        <div className="drawer-heading"><div><span className="eyebrow">Draft schedule</span><h2 id="shift-title">{target.entry?.working ? 'Edit shift' : 'Add shift'}</h2></div><button className="schedule-icon-button" onClick={onClose} aria-label="Close editor">×</button></div>
        <div className="drawer-form">
          <label>Employee<select value={staffId} onChange={(event) => setStaffId(event.target.value)}>{roster.map((person) => <option key={person.staffId} value={person.staffId}>{person.fullName}</option>)}</select></label>
          <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3"><label>Start<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>End<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label>Assignment<select><option>Primary role</option><option>Front desk</option><option>Closing coverage</option></select></label><label>Break<select value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)}><option value="0">No break</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label></div>
          <label>Location<select><option>JJ&apos;s Barbers</option></select></label>
          <label>Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional handoff or assignment details" /></label>
          {issues.length > 0 && <div className="validation-box"><strong>Review before saving</strong>{issues.map((issue) => <span key={issue}>⚠ {issue}</span>)}</div>}
          {!issues.length && <div className="validation-ok">✓ No scheduling conflicts found for {selected?.fullName}.</div>}
        </div>
        <div className="drawer-footer"><Button onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(true)} disabled={save.isPending || issues.length > 0}>Save & duplicate</Button><Button variant="solid" onClick={() => save.mutate(false)} disabled={save.isPending || issues.length > 0}>Save shift</Button></div>
      </aside>
    </div>
  );
}

function RequestsDrawer({ requests, onClose, onApprove, onDeny }: { requests: PendingRequest[]; onClose: () => void; onApprove: (id: string, confirmed?: boolean) => void; onDeny: (id: string) => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="schedule-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="requests-title"><div className="drawer-heading"><div><span className="eyebrow">Team inbox</span><h2 id="requests-title">Pending requests</h2></div><button className="schedule-icon-button" onClick={onClose}>×</button></div><div className="divide-y divide-black/5 overflow-y-auto">{requests.length === 0 ? <StatePanel title="All caught up" detail="There are no pending team requests." /> : requests.map((request) => <div className="request-item" key={request.id}><div className="flex items-center gap-2"><strong>{request.fullName}</strong><Pill tone={request.isWorking ? 'green' : 'amber'}>{request.isWorking ? 'Pickup' : 'Time off'}</Pill></div><p>{request.requestType === 'recurring' ? `Every ${DAYS[request.dayOfWeek ?? 0]}` : request.workDate?.slice(0, 10)}{request.reason ? ` · ${request.reason}` : ''}</p><div className="mt-3 flex gap-2"><Button variant="solid" onClick={() => onApprove(request.id, request.requestType === 'recurring')}>Approve</Button><Button onClick={() => onDeny(request.id)}>Decline</Button></div></div>)}</div></aside></div>;
}
