'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { Button, Card, Pill } from '../../../../components/ui';
import { isUndoShortcut, PublishReview, ScheduleUndoButton, ShiftContextMenu, staffingCoverageLabel, type ShiftMenuState } from './schedule-components';
import { useRequireAuth } from '../../../../lib/auth';

interface GridEntry {
  staffId: string;
  fullName: string;
  working: boolean;
  startTime: string | null;
  endTime: string | null;
  source?: 'exception' | 'recurring' | 'none';
  pendingRequest: { id: string; isWorking: boolean; reason: string | null } | null;
}
interface GridRow { date: string; dayOfWeek: number; entries: GridEntry[]; coverageCount: number; belowMinimum: boolean; peakChairUsage: number; overChairCapacity: boolean; bookedCapacityPct: number }
interface Roster { staffId: string; fullName: string; role: 'org_owner' | 'location_manager' | 'staff' | 'front_desk'; employmentStatus: 'active' | 'inactive' | 'resigned' }
interface Grid { roster: Roster[]; rows: GridRow[]; minimumCoverage: number; overtimeThresholdHours: number; chairCount: number; baseHourlyLaborCost?: number; payrollBurdenPct?: number; bookedCapacityPct: number; bookedMinutes: number; availableChairMinutes: number }
interface PendingRequest {
  id: string; fullName: string; requestType: 'one_time' | 'recurring'; workDate: string | null;
  dayOfWeek: number | null; isWorking: boolean; reason: string | null;
}
interface StoreHoursDay { day_of_week: number; is_open: boolean; open_time: string | null; close_time: string | null }
interface SpecialHours { id: string; date: string; label: string | null; isClosed: boolean; openTime: string | null; closeTime: string | null }
interface EditorTarget { staffId: string; fullName: string; date: string; entry?: GridEntry }
interface SchedulePublication { id: string; week_start: string; warning_count: number; notify_scope: 'all' | 'affected'; published_at: string }
interface ContextMenuState extends EditorTarget, Omit<ShiftMenuState, 'entry'> {}
interface UndoAction { target: EditorTarget; previous?: GridEntry; label: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROLES = ['Barber / stylist', 'Front desk', 'Manager', 'Owner'];
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
function dateRange(start: string, dayCount = 7) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(first); last.setDate(last.getDate() + dayCount - 1);
  const sameMonth = first.getMonth() === last.getMonth();
  const left = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const right = sameMonth
    ? `${last.getDate()}, ${last.getFullYear()}`
    : last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left}–${right}`;
}
function roleLabel(role: Roster['role']) { return role === 'org_owner' ? 'Owner' : role === 'location_manager' ? 'Manager' : role === 'front_desk' ? 'Front desk' : 'Barber / stylist'; }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }

export default function SchedulePage({ params }: { params: { locationId: string } }) {
  const auth = useRequireAuth();
  const canManage = auth?.role === 'org_owner' || auth?.role === 'location_manager';
  const queryClient = useQueryClient();
  const today = localDate(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [view, setView] = useState<'Week' | 'Day' | 'List'>('Week');
  const [daysShown, setDaysShown] = useState<3 | 5 | 7>(7);
  const [dirty, setDirty] = useState(false);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [toast, setToast] = useState('');
  const [dragged, setDragged] = useState<EditorTarget | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ staffId: string; date: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copiedShift, setCopiedShift] = useState<GridEntry | null>(null);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [notifyScope, setNotifyScope] = useState<'all' | 'affected'>('all');
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const grid = useQuery({
    queryKey: ['schedule', 'grid', weekStart],
    queryFn: () => api.get<Grid>(`/schedule/grid?startDate=${weekStart}&days=7`),
  });
  const requests = useQuery({ queryKey: ['schedule', 'requests'], queryFn: () => api.get<PendingRequest[]>('/schedule/requests'), enabled: canManage });
  const storeHours = useQuery({ queryKey: ['settings', 'store-hours'], queryFn: () => api.get<StoreHoursDay[]>('/settings/store-hours') });
  const specialHours = useQuery({ queryKey: ['settings', 'special-hours'], queryFn: () => api.get<SpecialHours[]>('/settings/special-hours') });
  const publication = useQuery({ queryKey: ['schedule', 'publication', weekStart], queryFn: () => api.get<SchedulePublication | null>(`/schedule/publication?weekStart=${weekStart}`) });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  const approve = useMutation({ mutationFn: ({ id, confirmed }: { id: string; confirmed?: boolean }) => api.post(`/schedule/requests/${id}/approve`, { confirmed }), onSuccess: invalidate });
  const deny = useMutation({ mutationFn: (id: string) => api.post(`/schedule/requests/${id}/deny`), onSuccess: invalidate });
  const saveShift = useMutation({
    mutationFn: async ({ target }: { target: EditorTarget; previous?: GridEntry }) => {
      const startTime = target.entry?.startTime ?? DEFAULT_START;
      const endTime = target.entry?.endTime ?? DEFAULT_END;
      const request = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: target.staffId, requestType: 'one_time', workDate: target.date,
        isWorking: true, startTime, endTime, reason: 'Manager schedule edit',
      });
      return api.post(`/schedule/requests/${request.id}/approve`, {});
    },
    onSuccess: (_, { target, previous }) => { setUndoStack((stack) => [...stack.slice(-9), { target, previous, label: `shift change for ${target.fullName}` }]); setDirty(true); setDirtyCount((count) => count + 1); invalidate(); },
  });
  const publishSchedule = useMutation({
    mutationFn: () => api.post<SchedulePublication>('/schedule/publish', { weekStart, warningCount: issueCount, notifyScope }),
    onSuccess: () => { setDirty(false); setDirtyCount(0); setUndoStack([]); setPublishReviewOpen(false); void queryClient.invalidateQueries({ queryKey: ['schedule', 'publication', weekStart] }); setToast('Schedule published and employee notifications are ready.'); },
  });
  const removeShift = useMutation({
    mutationFn: async ({ target }: { target: EditorTarget; previous?: GridEntry }) => {
      const request = await api.post<{ id: string }>('/schedule/requests', { locationStaffId: target.staffId, requestType: 'one_time', workDate: target.date, isWorking: false, reason: 'Removed by manager' });
      return api.post(`/schedule/requests/${request.id}/approve`, {});
    },
    onSuccess: (_, { target, previous }) => { setUndoStack((stack) => [...stack.slice(-9), { target, previous, label: `shift removal for ${target.fullName}` }]); setDirty(true); setDirtyCount((count) => count + 1); setContextMenu(null); invalidate(); setToast('Shift removed. Press Ctrl+Z to undo.'); },
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setView('List');
  }, []);

  const hoursByDay = useMemo(() => new Map((storeHours.data ?? []).map((item) => [item.day_of_week, item])), [storeHours.data]);
  const specialByDate = useMemo(() => new Map((specialHours.data ?? []).map((item) => [item.date, item])), [specialHours.data]);
  const entries = useMemo(() => {
    const result = new Map<string, GridEntry>();
    for (const row of grid.data?.rows ?? []) for (const entry of row.entries) result.set(`${entry.staffId}:${row.date}`, entry);
    return result;
  }, [grid.data]);
  const undoShift = useMutation({
    mutationFn: async (action: UndoAction) => {
      const request = await api.post<{ id: string }>('/schedule/requests', {
        locationStaffId: action.target.staffId, requestType: 'one_time', workDate: action.target.date,
        isWorking: action.previous?.working ?? false,
        startTime: action.previous?.working ? action.previous.startTime : undefined,
        endTime: action.previous?.working ? action.previous.endTime : undefined,
        reason: 'Undo manager schedule edit',
      });
      return api.post(`/schedule/requests/${request.id}/approve`, {});
    },
    onSuccess: (_, action) => {
      setUndoStack((stack) => stack.slice(0, -1));
      setDirtyCount((count) => { const next = Math.max(0, count - 1); setDirty(next > 0); return next; });
      invalidate();
      setToast(`Undid ${action.label}.`);
    },
  });
  const staffHours = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of grid.data?.rows ?? []) for (const entry of row.entries) result.set(entry.staffId, (result.get(entry.staffId) ?? 0) + (entry.working ? hoursBetween(entry.startTime, entry.endTime) : 0));
    return result;
  }, [grid.data]);
  const activeRoster = (grid.data?.roster ?? []).filter((person) => person.employmentStatus === 'active');
  const activeHours = activeRoster.map((person) => staffHours.get(person.staffId) ?? 0);
  const totalHours = activeHours.reduce((sum, value) => sum + value, 0);
  const overtimeThreshold = grid.data?.overtimeThresholdHours ?? 40;
  const overtime = activeHours.reduce((sum, value) => sum + Math.max(0, value - overtimeThreshold), 0);
  const warnings = (grid.data?.rows ?? []).filter((row) => row.belowMinimum);
  const capacityWarnings = (grid.data?.rows ?? []).filter((row) => row.overChairCapacity);
  const overtimeStaff = (grid.data?.roster ?? []).filter((person) => person.employmentStatus === 'active' && (staffHours.get(person.staffId) ?? 0) > overtimeThreshold);
  const issueCount = warnings.length + capacityWarnings.length + overtimeStaff.length;
  const inactiveRoster = (grid.data?.roster ?? []).filter((person) => person.employmentStatus === 'inactive');
  const resignedRoster = (grid.data?.roster ?? []).filter((person) => person.employmentStatus === 'resigned');
  const visibleRoster = activeRoster.filter((person) => roleFilter === 'All roles' || roleLabel(person.role) === roleFilter);
  const insights = [
    ...capacityWarnings.slice(0, 2).map((row) => `${DAYS[row.dayOfWeek]} has more overlapping shifts than available chairs`),
    ...warnings.slice(0, 2).map((row) => `${DAYS[row.dayOfWeek]} is below minimum staffing`),
    ...overtimeStaff.slice(0, 2).map((person) => `${person.fullName} is ${(staffHours.get(person.staffId) ?? 0) - overtimeThreshold} hours over the weekly threshold`),
  ];
  const visibleRows = view === 'Day'
    ? (grid.data?.rows ?? []).filter((row) => row.date === today || (!grid.data?.rows.some((item) => item.date === today) && row.date === weekStart))
    : (grid.data?.rows ?? []).slice(0, daysShown);

  function openAddShift() {
    const person = visibleRoster[0] ?? activeRoster[0];
    if (person) setEditor({ ...person, date: visibleRows[0]?.date ?? weekStart });
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select') || target.isContentEditable) return;
      if (event.key === 'Escape') {
        setEditor(null);
        setRequestsOpen(false);
        setContextMenu(null);
        setPublishReviewOpen(false);
      }
      if (canManage && event.key.toLowerCase() === 'n' && !editor && !requestsOpen) {
        event.preventDefault();
        openAddShift();
      }
      if (canManage && isUndoShortcut(event)) {
        event.preventDefault();
        const action = undoStack[undoStack.length - 1];
        if (action && !undoShift.isPending) undoShift.mutate(action);
        else if (!action) setToast('Nothing to undo.');
        return;
      }
      if (!selectedCell || editor || requestsOpen || publishReviewOpen) return;
      const staffIndex = visibleRoster.findIndex((person) => person.staffId === selectedCell.staffId);
      const dayIndex = visibleRows.findIndex((row) => row.date === selectedCell.date);
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const nextStaffIndex = Math.max(0, Math.min(visibleRoster.length - 1, staffIndex + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
        const nextDayIndex = Math.max(0, Math.min(visibleRows.length - 1, dayIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
        const nextPerson = visibleRoster[nextStaffIndex];
        const nextDay = visibleRows[nextDayIndex];
        if (nextPerson && nextDay) {
          setSelectedCell({ staffId: nextPerson.staffId, date: nextDay.date });
          window.requestAnimationFrame(() => document.getElementById(`shift-cell-${nextPerson.staffId}-${nextDay.date}`)?.focus());
        }
      }
      if (canManage && event.key === 'Enter') {
        const person = visibleRoster[staffIndex];
        if (person) setEditor({ ...person, date: selectedCell.date, entry: entries.get(`${person.staffId}:${selectedCell.date}`) });
      }
      if (canManage && (event.key === 'Delete' || event.key === 'Backspace')) {
        const person = visibleRoster[staffIndex];
        const entry = person ? entries.get(`${person.staffId}:${selectedCell.date}`) : undefined;
        if (person && entry?.working && window.confirm(`Remove ${person.fullName}'s shift on ${selectedCell.date}?`)) removeShift.mutate({ target: { ...person, date: selectedCell.date, entry }, previous: entry });
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canManage, editor, requestsOpen, publishReviewOpen, selectedCell, grid.data, visibleRoster, visibleRows, entries, undoStack, undoShift.isPending]);
  async function dropShift(staffId: string, fullName: string, date: string) {
    if (!dragged?.entry?.working || (dragged.staffId === staffId && dragged.date === date)) return;
    const target = { staffId, fullName, date, entry: dragged.entry };
    await saveShift.mutateAsync({ target, previous: entries.get(`${staffId}:${date}`) });
    setDragged(null);
    setToast(`Shift copied to ${fullName} on ${date}.`);
  }
  function duplicateShift(target: EditorTarget, date = moveDate(target.date, 1)) {
    if (!target.entry?.working) return;
    const destination = { ...target, date };
    void saveShift.mutateAsync({ target: destination, previous: entries.get(`${destination.staffId}:${date}`) }).then(() => setToast(`Shift duplicated to ${date}. Press Ctrl+Z to undo.`));
    setContextMenu(null);
  }

  if (grid.isError) return <StatePanel title="Schedule unavailable" detail="We could not load this week. Refresh the page to try again." />;

  return (
    <main className="schedule-page" aria-live="polite">
      <header className="schedule-toolbar">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b6f47]">Planning</p>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Team schedule</h1>
            <Pill tone={dirty ? 'amber' : publication.data ? 'green' : 'gray'}>{dirty ? 'Changed after publish' : publication.data ? 'Published' : 'Draft'}</Pill>
          </div>
          <p className="mt-1 text-xs text-gray-500">{publication.data ? `Last published ${new Date(publication.data.published_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : canManage ? 'Review the schedule, then publish it for the team' : 'The manager has not published this week yet'}</p>
        </div>
        <div className="schedule-toolbar-actions">
          <select aria-label="Location" className="schedule-control schedule-location-control"><option>JJ&apos;s Barbers</option></select>
          <span className="inline-flex min-w-[10.5rem] justify-end">{weekStart !== startOfWeek(new Date()) && <button className="schedule-filter" onClick={() => setWeekStart(startOfWeek(new Date()))}>{view === 'Day' ? 'Back to today' : 'Back to current week'}</button>}</span>
          <div className="inline-flex rounded-lg border border-black/10 bg-white p-0.5">
            <button className="schedule-icon-button" aria-label="Previous week" onClick={() => setWeekStart(moveDate(weekStart, -7))}>←</button>
            <button className="schedule-icon-button" aria-label="Next week" onClick={() => setWeekStart(moveDate(weekStart, 7))}>→</button>
          </div>
          <strong className="min-w-36 text-center text-sm">{dateRange(weekStart, view === 'Day' ? 1 : daysShown)}</strong>
          <select aria-label="Schedule view" className="schedule-control" value={view} onChange={(event) => setView(event.target.value as typeof view)}><option>Week</option><option>Day</option><option>List</option></select>
          {view !== 'Day' && <select aria-label="Days shown" className="schedule-control" value={daysShown} onChange={(event) => setDaysShown(Number(event.target.value) as 3 | 5 | 7)}><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option></select>}
          {canManage && undoStack.length > 0 && <ScheduleUndoButton onUndo={() => { const action = undoStack[undoStack.length - 1]; if (action) undoShift.mutate(action); }} pending={undoShift.isPending} />}
          {canManage && <Button onClick={openAddShift}>+ Add Shift <span className="ml-1 text-xs opacity-50">N</span></Button>}
          {canManage && <Button variant="solid" onClick={() => setPublishReviewOpen(true)} disabled={publishSchedule.isPending}>{dirtyCount ? `Publish (${dirtyCount})` : 'Review & publish'}</Button>}
        </div>
      </header>

      <section className="schedule-filters" aria-label="Schedule filters">
        <select className="schedule-control" aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option>All roles</option>{ROLES.map((role) => <option key={role}>{role}</option>)}
        </select>
        {canManage && <button className={`schedule-filter ${issuesOnly ? 'schedule-filter-active' : ''}`} onClick={() => setIssuesOnly((value) => !value)}>⚠ {issueCount} issues</button>}
        {canManage && <button className="schedule-filter" onClick={() => setRequestsOpen(true)}>Requests <span className="request-count">{requests.data?.length ?? 0}</span></button>}
        <button className="schedule-filter ml-auto" onClick={() => window.print()}>Print schedule</button>
      </section>

      <section className="schedule-summary" aria-label="Weekly schedule summary" style={{ gridTemplateColumns: `repeat(${canManage ? 6 : 3}, minmax(0, 1fr))` }}>
        <Summary label="Scheduled" value={`${totalHours.toFixed(totalHours % 1 ? 1 : 0)} hrs`} detail={`${visibleRoster.length} team members`} />
        {canManage && <Summary label="Est. labor" value={`$${Math.round(totalHours * (grid.data?.baseHourlyLaborCost ?? 0) * (1 + (grid.data?.payrollBurdenPct ?? 0) / 100)).toLocaleString()}`} detail={`$${grid.data?.baseHourlyLaborCost ?? 0}/hr${grid.data?.payrollBurdenPct ? ` + ${grid.data.payrollBurdenPct}% burden` : ''}`} />}
        {canManage && <Summary label="Overtime" value={overtime ? `${overtime.toFixed(1)} hrs` : 'None'} detail={overtime ? 'Needs attention' : 'Within limits'} warning={overtime > 0} />}
        <Summary label="Staffing" value={(warnings.length || capacityWarnings.length) ? `${warnings.length + capacityWarnings.length} warning${warnings.length + capacityWarnings.length > 1 ? 's' : ''}` : 'On target'} detail={capacityWarnings.length ? 'More staff than chairs' : warnings.length ? 'Below minimum staffing' : 'Staffing fits your coverage and chair limits'} warning={warnings.length > 0 || capacityWarnings.length > 0} />
        {canManage && <Summary label="Requests" value={String(requests.data?.length ?? 0)} detail={(requests.data?.length ?? 0) ? 'Awaiting review' : 'All caught up'} />}
        <Summary label="Location capacity" value={`${grid.data?.chairCount ?? 4} chairs`} detail={`${grid.data?.bookedCapacityPct ?? 0}% booked · fixed in Settings`} />
      </section>
      {canManage && insights.length > 0 && <section className="flex flex-wrap items-center gap-2" aria-label="Scheduling insights"><span className="text-xs font-semibold text-gray-500">Insights</span>{insights.map((insight) => <span key={insight} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-gray-600">{insight}</span>)}</section>}

      {issuesOnly && issueCount > 0 && (
        <div className="issues-banner"><strong>Schedule issues</strong><div className="flex flex-wrap gap-2">{overtimeStaff.map((person) => <span key={person.staffId} className="issue-link">{person.fullName} · {(staffHours.get(person.staffId) ?? 0).toFixed(1)} hrs</span>)}{capacityWarnings.map((row) => <button key={`chairs-${row.date}`} className="issue-link" onClick={() => document.getElementById(`schedule-day-${row.date}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}>{DAYS[row.dayOfWeek]} · overlapping shifts exceed capacity</button>)}{warnings.map((row) => <button key={row.date} className="issue-link" onClick={() => document.getElementById(`schedule-day-${row.date}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}>{DAYS[row.dayOfWeek]} · {row.coverageCount}/{grid.data?.minimumCoverage} staffed</button>)}</div><button onClick={() => setIssuesOnly(false)}>Dismiss</button></div>
      )}

      <Card className="schedule-surface">
        {grid.isLoading ? <StatePanel title="Loading schedule…" detail="Preparing this week’s staffing plan." /> : visibleRoster.length === 0 ? <StatePanel title="No team members match" detail="Clear the role filter to see the full team." /> : view === 'List' ? (
          <Agenda rows={visibleRows} roster={visibleRoster} entries={entries} editable={canManage} onEdit={setEditor} />
        ) : (
          <div className="schedule-scroll">
            <div className="schedule-grid" role="grid" aria-label={`${dateRange(weekStart, visibleRows.length)} team schedule`} style={{ gridTemplateColumns: `240px repeat(${visibleRows.length}, minmax(150px, 1fr))` }}>
              <div className="employee-header">Team member</div>
              {visibleRows.map((row) => { const special = specialByDate.get(row.date); const hours = special ? { day_of_week: row.dayOfWeek, is_open: !special.isClosed, open_time: special.openTime, close_time: special.closeTime } : hoursByDay.get(row.dayOfWeek); return <DayHeader key={row.date} row={row} today={today} minimum={grid.data!.minimumCoverage} hours={hours} specialLabel={special?.label ?? (special?.isClosed ? 'Special closure' : null)} />; })}
              {visibleRoster.map((person, index) => {
                const weeklyHours = staffHours.get(person.staffId) ?? 0;
                const shiftCount = visibleRows.filter((row) => entries.get(`${person.staffId}:${row.date}`)?.working).length;
                const overtimeHours = Math.max(0, weeklyHours - overtimeThreshold);
                return (
                  <div className="contents" key={person.staffId}>
                    <div className="employee-cell">
                      <span className="avatar">{initials(person.fullName)}</span>
                      <span className="min-w-0">{canManage || auth?.locationStaffId === person.staffId ? <a href={`/locations/${params.locationId}/staff/${person.staffId}`} className="relative z-20 block truncate text-sm font-semibold hover:underline">{person.fullName}</a> : <strong className="block truncate text-sm font-semibold">{person.fullName}</strong>}<span className="block truncate text-xs text-gray-500">{roleLabel(person.role)}</span><span className="block truncate text-[11px] text-gray-400">{weeklyHours.toFixed(weeklyHours % 1 ? 1 : 0)} hrs · {shiftCount} shift{shiftCount === 1 ? '' : 's'}{canManage && overtimeHours ? ` · +${overtimeHours.toFixed(1)} OT` : ''}</span></span>
                      {weeklyHours > overtimeThreshold && <span className="warning-dot" title={`Above ${overtimeThreshold}-hour threshold`}>!</span>}
                    </div>
                    {visibleRows.map((row, rowIndex) => {
                      const entry = entries.get(`${person.staffId}:${row.date}`);
                      const special = specialByDate.get(row.date);
                      const closed = special ? special.isClosed : hoursByDay.get(row.dayOfWeek)?.is_open === false;
                      return (
                        <div key={row.date} id={`shift-cell-${person.staffId}-${row.date}`} role="gridcell" tabIndex={(selectedCell?.staffId === person.staffId && selectedCell.date === row.date) || (!selectedCell && index === 0 && rowIndex === 0) ? 0 : -1} aria-selected={selectedCell?.staffId === person.staffId && selectedCell.date === row.date} aria-label={`${person.fullName}, ${row.date}${entry?.working ? `, ${displayTime(entry.startTime)} to ${displayTime(entry.endTime)}` : ', no shift'}`} className={`shift-cell ${row.date === today ? 'today-cell' : ''} ${closed ? 'closed-cell' : ''} ${dragged ? 'drag-target' : ''} ${selectedCell?.staffId === person.staffId && selectedCell.date === row.date ? 'selected-shift-cell' : ''}`}
                          onFocus={() => setSelectedCell({ staffId: person.staffId, date: row.date })}
                          onKeyDown={(event) => { if (canManage && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry, x: rect.left + 24, y: rect.top + 24 }); } }}
                          onContextMenu={(event) => { if (!canManage) return; event.preventDefault(); setSelectedCell({ staffId: person.staffId, date: row.date }); setContextMenu({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry, x: event.clientX, y: event.clientY }); }}
                          onDragOver={(event) => { if (canManage) event.preventDefault(); }} onDrop={() => { if (canManage) void dropShift(person.staffId, person.fullName, row.date); }}>
                          {canManage && <button className="empty-shift" aria-label={`Add shift for ${person.fullName} on ${row.date}`} onClick={() => setEditor({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry })} onDoubleClick={() => setEditor({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry })}>+</button>}
                          {entry?.pendingRequest ? <button className="request-shift time-off-shift" onClick={() => setRequestsOpen(true)}>Time off requested</button> : entry?.working && entry.startTime && entry.endTime ? (
                            <button draggable={canManage} onDragStart={() => { if (canManage) setDragged({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry }); }} onDragEnd={() => setDragged(null)}
                              className={`shift-card ${entry.source === 'exception' ? 'changed-shift' : ''} ${canManage && weeklyHours > overtimeThreshold ? 'overtime-shift' : ''} ${dirty ? 'draft-shift' : 'published-shift'}`} onClick={() => { if (canManage) setEditor({ staffId: person.staffId, fullName: person.fullName, date: row.date, entry }); }}
                              title={`${person.fullName}: ${displayTime(entry.startTime)}–${displayTime(entry.endTime)}${canManage ? '. Click to edit or drag to copy.' : ''}`}>
                              <span className="shift-time">{displayTime(entry.startTime)}–{displayTime(entry.endTime)}</span>
                              <span className="shift-meta">{entry.source === 'exception' ? 'Changed' : dirty ? 'Draft' : 'Scheduled'} · 30m break</span>
                              {canManage && <span className="shift-extra">Click to edit · Drag to copy</span>}
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

      {canManage && inactiveRoster.length > 0 && <section><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Inactive employees</h2><Card className="divide-y divide-black/5">{inactiveRoster.map((person) => <a key={person.staffId} href={`/locations/${params.locationId}/staff/${person.staffId}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-stone-50"><span>{person.fullName}</span><span className="text-xs text-gray-400">View profile and hours →</span></a>)}</Card></section>}
      {canManage && resignedRoster.length > 0 && <details><summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">Resigned employees ({resignedRoster.length})</summary><Card className="mt-2 divide-y divide-black/5">{resignedRoster.map((person) => <a key={person.staffId} href={`/locations/${params.locationId}/staff/${person.staffId}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-stone-50"><span>{person.fullName}</span><span className="text-xs text-gray-400">View archived profile →</span></a>)}</Card></details>}

      {canManage && editor && <ShiftEditor target={editor} roster={activeRoster} hours={specialByDate.has(editor.date) ? { day_of_week: new Date(`${editor.date}T12:00:00`).getDay(), is_open: !specialByDate.get(editor.date)!.isClosed, open_time: specialByDate.get(editor.date)!.openTime, close_time: specialByDate.get(editor.date)!.closeTime } : hoursByDay.get(new Date(`${editor.date}T12:00:00`).getDay())} onClose={() => setEditor(null)} onSaved={(savedTarget, undoable) => { if (undoable) setUndoStack((stack) => [...stack.slice(-9), { target: savedTarget, previous: entries.get(`${savedTarget.staffId}:${savedTarget.date}`), label: `shift change for ${savedTarget.fullName}` }]); setDirty(true); setDirtyCount((count) => count + 1); invalidate(); setToast(undoable ? 'Shift saved. Press Ctrl+Z to undo.' : 'Permanent schedule change saved.'); }} />}
      {canManage && requestsOpen && <RequestsDrawer requests={requests.data ?? []} onClose={() => setRequestsOpen(false)} onApprove={(id, confirmed) => approve.mutate({ id, confirmed })} onDeny={(id) => deny.mutate(id)} />}
      {canManage && publishReviewOpen && <PublishReview dirtyCount={dirtyCount} issueCount={issueCount} activeCount={activeRoster.length} notifyScope={notifyScope} published={!!publication.data} onNotifyScope={setNotifyScope} onClose={() => setPublishReviewOpen(false)} onPublish={() => publishSchedule.mutate()} pending={publishSchedule.isPending} />}
      {canManage && contextMenu && <ShiftContextMenu state={contextMenu} copied={!!copiedShift} onClose={() => setContextMenu(null)} onEdit={() => { setEditor(contextMenu); setContextMenu(null); }} onDuplicate={() => duplicateShift(contextMenu)} onCopy={() => { if (contextMenu.entry?.working) { setCopiedShift(contextMenu.entry); setToast('Shift copied. Select another cell and paste.'); } setContextMenu(null); }} onPaste={() => { if (copiedShift) duplicateShift({ ...contextMenu, entry: copiedShift }, contextMenu.date); }} onDelete={() => { if (contextMenu.entry?.working && window.confirm(`Remove ${contextMenu.fullName}'s shift on ${contextMenu.date}?`)) removeShift.mutate({ target: contextMenu, previous: entries.get(`${contextMenu.staffId}:${contextMenu.date}`) }); }} />}
      {toast && <div className="schedule-toast" role="status">{toast}</div>}
    </main>
  );
}

function Summary({ label, value, detail, warning }: { label: string; value: string; detail: string; warning?: boolean }) {
  return <div><span>{label}</span><strong className={warning ? 'text-amber-700' : ''}>{value}</strong><small>{detail}</small></div>;
}
function StatePanel({ title, detail }: { title: string; detail: string }) {
  return <div className="p-12 text-center"><strong className="block">{title}</strong><span className="mt-1 block text-sm text-gray-500">{detail}</span></div>;
}
function DayHeader({ row, today, minimum, hours, specialLabel }: { row: GridRow; today: string; minimum: number; hours?: StoreHoursDay; specialLabel?: string | null }) {
  const date = new Date(`${row.date}T12:00:00`);
  return (
    <div id={`schedule-day-${row.date}`} className={`day-header ${row.date === today ? 'today-header' : ''} ${hours?.is_open === false ? 'closed-cell' : ''}`}>
      <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-gray-500">{DAYS[row.dayOfWeek]}</span><strong className="text-lg">{date.getDate()}</strong></div>
      <span className="day-detail">{hours?.is_open && hours.open_time && hours.close_time ? `${displayTime(hours.open_time)}–${displayTime(hours.close_time)}` : 'Closed'}</span>
      {specialLabel && <span className="day-detail font-semibold text-purple-700">{specialLabel}</span>}
      <span className="day-detail">{row.bookedCapacityPct}% booked</span>
      <span className={`coverage-label ${row.belowMinimum ? 'coverage-warning' : ''}`}>{row.belowMinimum ? '⚠ ' : '✓ '}{staffingCoverageLabel(row.coverageCount, minimum)}</span>
      <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${row.belowMinimum || row.overChairCapacity ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{row.belowMinimum ? 'Understaffed' : row.overChairCapacity ? 'Too many overlapping shifts' : 'Fully staffed'}</span>
    </div>
  );
}

function Agenda({ rows, roster, entries, editable, onEdit }: { rows: GridRow[]; roster: Roster[]; entries: Map<string, GridEntry>; editable: boolean; onEdit: (target: EditorTarget) => void }) {
  return <div className="divide-y divide-black/5">{rows.map((row) => <section key={row.date} className="p-4"><h3 className="mb-3 font-semibold">{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3><div className="space-y-2">{roster.map((person) => { const entry = entries.get(`${person.staffId}:${row.date}`); return entry?.working ? <button key={person.staffId} disabled={!editable} className="flex w-full items-center justify-between rounded-lg border border-black/10 p-3 text-left enabled:hover:bg-black/[.02]" onClick={() => onEdit({ ...person, date: row.date, entry })}><span>{person.fullName}</span><strong>{displayTime(entry.startTime)}–{displayTime(entry.endTime)}</strong></button> : null; })}</div></section>)}</div>;
}

function ShiftEditor({ target, roster, hours, onClose, onSaved }: { target: EditorTarget; roster: Roster[]; hours?: StoreHoursDay; onClose: () => void; onSaved: (target: EditorTarget, undoable: boolean) => void }) {
  const [staffId, setStaffId] = useState(target.staffId);
  const [date, setDate] = useState(target.date);
  const [startTime, setStartTime] = useState(target.entry?.startTime ?? DEFAULT_START);
  const [endTime, setEndTime] = useState(target.entry?.endTime ?? DEFAULT_END);
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const [applyRecurring, setApplyRecurring] = useState(false);
  const selected = roster.find((person) => person.staffId === staffId);
  const issues: string[] = [];
  if (startTime >= endTime) issues.push('End time must be after start time.');
  if (hours?.is_open === false) issues.push('The salon is closed on this day.');
  if (hours?.open_time && startTime < hours.open_time.slice(0, 5)) issues.push('Shift starts before store hours.');
  if (hours?.close_time && endTime > hours.close_time.slice(0, 5)) issues.push('Shift ends after store hours.');
  if (hoursBetween(startTime, endTime) >= 6 && Number(breakMinutes) < 30) issues.push('A 30-minute meal break is required.');
  const save = useMutation({
    mutationFn: async (duplicate: boolean) => {
      const savedDate = duplicate ? moveDate(date, 1) : date;
      const request = await api.post<{ id: string }>('/schedule/requests', applyRecurring
        ? { locationStaffId: staffId, requestType: 'recurring', dayOfWeek: new Date(`${date}T12:00:00`).getDay(), isWorking: true, startTime, endTime, reason: notes || 'Permanent manager schedule edit' }
        : { locationStaffId: staffId, requestType: 'one_time', workDate: savedDate, isWorking: true, startTime, endTime, reason: notes || 'Manager schedule edit' });
      await api.post(`/schedule/requests/${request.id}/approve`, applyRecurring ? { confirmed: true } : {});
      return { staffId, fullName: selected?.fullName ?? target.fullName, date: savedDate, entry: { ...target.entry, staffId, fullName: selected?.fullName ?? target.fullName, working: true, startTime, endTime, pendingRequest: null } as GridEntry };
    },
    onSuccess: (savedTarget) => { onSaved(savedTarget, !applyRecurring); onClose(); },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const request = await api.post<{ id: string }>('/schedule/requests', applyRecurring
        ? { locationStaffId: staffId, requestType: 'recurring', dayOfWeek: new Date(`${date}T12:00:00`).getDay(), isWorking: false, reason: 'Permanent removal by manager' }
        : { locationStaffId: staffId, requestType: 'one_time', workDate: date, isWorking: false, reason: 'Removed by manager' });
      await api.post(`/schedule/requests/${request.id}/approve`, applyRecurring ? { confirmed: true } : {});
      return { staffId, fullName: selected?.fullName ?? target.fullName, date, entry: target.entry };
    },
    onSuccess: (savedTarget) => { onSaved(savedTarget, !applyRecurring); onClose(); },
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
          <label className="rounded-lg border border-black/10 bg-stone-50 p-3"><span className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={applyRecurring} onChange={(event) => setApplyRecurring(event.target.checked)} /><span><strong className="block text-sm text-black">Make this a permanent weekly change</strong><span className="mt-1 block font-normal text-gray-500">Changes the usual schedule for every future {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}, replacing the recurring schedule.</span></span></span></label>
          {issues.length > 0 && <div className="validation-box"><strong>Review before saving</strong>{issues.map((issue) => <span key={issue}>⚠ {issue}</span>)}</div>}
          {!issues.length && <div className="validation-ok">✓ No scheduling conflicts found for {selected?.fullName}.</div>}
        </div>
        <div className="drawer-footer">
          {target.entry?.working && <button className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={remove.isPending} onClick={() => { const message = applyRecurring ? `This will remove ${selected?.fullName ?? 'this employee'} from every future ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}. This is a permanent recurring change. Continue?` : `Remove ${selected?.fullName ?? 'this employee'} from the schedule on ${date}?`; if (window.confirm(message)) remove.mutate(); }}>Remove shift</button>}
          <Button onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(true)} disabled={applyRecurring || save.isPending || issues.length > 0}>Save & duplicate</Button><Button variant="solid" onClick={() => { if (!applyRecurring || window.confirm(`This will change every future ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })} for ${selected?.fullName}. This is a permanent recurring change. Continue?`)) save.mutate(false); }} disabled={save.isPending || issues.length > 0}>{applyRecurring ? 'Confirm permanent change' : 'Save shift'}</Button>
        </div>
      </aside>
    </div>
  );
}

function RequestsDrawer({ requests, onClose, onApprove, onDeny }: { requests: PendingRequest[]; onClose: () => void; onApprove: (id: string, confirmed?: boolean) => void; onDeny: (id: string) => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="schedule-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="requests-title"><div className="drawer-heading"><div><span className="eyebrow">Team inbox</span><h2 id="requests-title">Pending requests</h2></div><button className="schedule-icon-button" onClick={onClose}>×</button></div><div className="divide-y divide-black/5 overflow-y-auto">{requests.length === 0 ? <StatePanel title="All caught up" detail="There are no pending team requests." /> : requests.map((request) => <div className="request-item" key={request.id}><div className="flex items-center gap-2"><strong>{request.fullName}</strong><Pill tone={request.isWorking ? 'green' : 'amber'}>{request.isWorking ? 'Pickup' : 'Time off'}</Pill></div><p>{request.requestType === 'recurring' ? `Every ${DAYS[request.dayOfWeek ?? 0]}` : request.workDate?.slice(0, 10)}{request.reason ? ` · ${request.reason}` : ''}</p><div className="mt-3 flex gap-2"><Button variant="solid" onClick={() => onApprove(request.id, request.requestType === 'recurring')}>Approve</Button><Button onClick={() => onDeny(request.id)}>Decline</Button></div></div>)}</div></aside></div>;
}
