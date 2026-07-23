'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { formatPhoneInput } from '../../../../lib/phone';
import { useLiveQueueSync } from '../../../../lib/socket';
import { Button, Card, ClickableName, ClockInDropdown, Pill, RowMenu, StatusDropdown } from '../../../../components/ui';
import { ProfessionalPicker } from '../../../../components/professional-picker';
import { ServiceMultiPicker } from '../../../../components/service-multi-picker';
import { SanitationReminder, type SanitationReminderState } from '../../../../components/sanitation-reminder';
import { CardPaymentFields, type BrowserPaymentConfig } from '../../../../components/card-payment-fields';
import { useRequireAuth } from '../../../../lib/auth';

/** Ticks every 30s so elapsed/ETA/late computations stay live without a full board refetch. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface TeamMember {
  locationStaffId: string;
  fullName: string;
  status: 'available' | 'busy' | 'break' | 'off';
  role: string;
}

interface QueueEntry {
  id: string;
  status: string;
  clientId: string | null;
  clientName: string | null;
  guestName: string | null;
  serviceId: string;
  serviceName: string;
  serviceDurationMinutes: number;
  serviceIds: string[];
  services: { id: string; name: string; durationMinutes: number; price: string }[];
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  requestedSpecificStaff: boolean;
  requestedStaffId: string | null;
  present: boolean;
  presentCheckedAt: string | null;
  readyOverride: boolean | null;
  isAppt: boolean;
  apptAt: string | null;
  waitingOrder: number | null;
  estimatedStart: string | null;
  /** Short disambiguation note set when another waiting entry shares this client's display name. */
  identityNote?: string | null;
  serviceStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recommendedStaffId?: string | null;
  recommendedStaffName?: string | null;
  matchReason?: 'requested' | 'familiar_barber' | 'team_variety' | 'next_available' | null;
  continuityVisitCount?: number;
  /** True when the appointment SLA soft-bump had to protect this entry's seating estimate — see appointment-sla.ts. */
  apptSlaProtected?: boolean;
  /** apptAt + the shop's appointment_max_wait_minutes — the "seat by" deadline shown when apptSlaProtected. */
  apptSlaDeadline?: string | null;
}

interface Board {
  timezone: string;
  team: TeamMember[];
  nowServing: QueueEntry[];
  /** Effective seating-priority order (ids) computed server-side — same as `waiting`'s order except when an appointment SLA bump reorders it for matching purposes. */
  priorityOrder?: string[];
  waiting: QueueEntry[];
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  stock_qty: number;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  entity_id: string | null;
  created_at: string;
  /** Human-readable summary built server-side (queue.service.activityLog), names resolved. */
  description: string;
}

function displayName(e: { clientName: string | null; guestName: string | null }) {
  return e.clientName ?? e.guestName ?? 'Guest';
}

function timeLabel(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function durationLabel(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
}

const STAFF_DOT: Record<string, string> = {
  available: 'bg-green-500',
  busy: 'bg-blue-500',
  break: 'bg-amber-500',
  off: 'bg-gray-300',
};

export default function QueuePage({ params }: { params: { locationId: string } }) {
  useLiveQueueSync();
  const auth = useRequireAuth();
  const canManage = auth?.role === 'org_owner' || auth?.role === 'location_manager';
  const queryClient = useQueryClient();
  const [showCheckIn, setShowCheckIn] = useState<'walkin' | 'appointment' | null>(null);
  const [checkoutEntry, setCheckoutEntry] = useState<QueueEntry | null>(null);
  const [startEntry, setStartEntry] = useState<QueueEntry | null>(null);
  const [suggestedStartStaffId, setSuggestedStartStaffId] = useState<string | null>(null);
  const [reassignEntry, setReassignEntry] = useState<QueueEntry | null>(null);
  const [suggestedReassignStaffId, setSuggestedReassignStaffId] = useState<string | null>(null);
  const [changeServiceEntry, setChangeServiceEntry] = useState<QueueEntry | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);
  const [localWaitingOrder, setLocalWaitingOrder] = useState<string[] | null>(null);
  const [showCloseShop, setShowCloseShop] = useState(false);
  const [showOpenShop, setShowOpenShop] = useState(false);
  const [confirmingUndo, setConfirmingUndo] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [clientPreviewId, setClientPreviewId] = useState<string | null>(null);
  const [identityNotePrompt, setIdentityNotePrompt] = useState<QueueEntry | null>(null);
  const now = useClock();

  const board = useQuery({ queryKey: ['queue', 'board'], queryFn: () => api.get<Board>('/queue/board'), refetchInterval: 20_000 });
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const activity = useQuery({ queryKey: ['queue', 'activity'], queryFn: () => api.get<ActivityEvent[]>('/queue/activity?limit=15') });
  const sanitation = useQuery({ queryKey: ['settings', 'sanitation-reminders'], queryFn: () => api.get<SanitationReminderState>('/settings/sanitation-reminders'), refetchInterval: 30_000 });
  const shopStatus = useQuery({ queryKey: ['payments', 'shop-status'], queryFn: () => api.get<{ state: 'not_opened' | 'open' | 'closed' }>('/payments/shop-status') });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['queue', 'board'] });
    void queryClient.invalidateQueries({ queryKey: ['queue', 'activity'] });
    void queryClient.invalidateQueries({ queryKey: ['payments', 'shop-status'] });
  }

  const clockIn = useMutation({ mutationFn: (staffId: string) => api.post(`/staff/${staffId}/clock-in`), onSuccess: invalidate });
  const refreshSanitation = () => void queryClient.invalidateQueries({ queryKey: ['settings', 'sanitation-reminders'] });
  const snoozeSanitation = useMutation({ mutationFn: () => api.post('/settings/sanitation-reminders/snooze'), onSuccess: refreshSanitation });
  const completeSanitation = useMutation({ mutationFn: () => api.post('/settings/sanitation-reminders/complete'), onSuccess: refreshSanitation });

  const setStatus = useMutation({
    mutationFn: ({ staffId, status }: { staffId: string; status: string }) => api.post(`/staff/${staffId}/status`, { status }),
    onSuccess: invalidate,
    onError: (err) => {
      if (err instanceof ApiError && err.body?.code === 'STAFF_HAS_ACTIVE_CLIENT') alert(err.body.message);
    },
  });

  const undo = useMutation({ mutationFn: (eventId: string) => api.post(`/queue/undo/${eventId}`), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/queue/${id}/cancel`), onSuccess: invalidate });
  const noShow = useMutation({ mutationFn: (id: string) => api.post(`/queue/${id}/no-show`), onSuccess: invalidate });
  const abandon = useMutation({ mutationFn: (id: string) => api.post(`/queue/${id}/abandon`), onSuccess: invalidate });
  const returnToWaiting = useMutation({
    mutationFn: ({ id, position }: { id: string; position: 'top' | 'original' }) => api.post(`/queue/${id}/return-to-waiting`, { position }),
    onSuccess: invalidate,
  });
  const togglePresent = useMutation({
    mutationFn: ({ id, present, identityNote }: { id: string; present: boolean; identityNote?: string }) => api.post(`/queue/${id}/present`, { present, identityNote }),
    onSuccess: invalidate,
  });
  const toggleReady = useMutation({
    mutationFn: ({ id, ready }: { id: string; ready: boolean }) => api.post(`/queue/${id}/ready`, { ready }),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (orderedQueueEntryIds: string[]) => api.post('/queue/reorder', { orderedQueueEntryIds }),
    onSuccess: invalidate,
    onSettled: () => setLocalWaitingOrder(null),
  });

  const onShiftTeam = board.data?.team.filter((t) => t.status !== 'off') ?? [];
  const offShiftTeam = board.data?.team.filter((t) => t.status === 'off') ?? [];

  const waitingList = localWaitingOrder
    ? localWaitingOrder.map((id) => board.data!.waiting.find((w) => w.id === id)!).filter(Boolean)
    : (board.data?.waiting ?? []);

  // Names that appear on more than one current waiting entry — used to prompt
  // for a short disambiguating note ("blue jacket") when one of them checks in.
  const duplicateNameCounts = new Map<string, number>();
  for (const entry of waitingList) {
    const key = displayName(entry).trim().toLowerCase();
    duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
  }
  function hasDuplicateName(entry: QueueEntry) {
    return (duplicateNameCounts.get(displayName(entry).trim().toLowerCase()) ?? 0) > 1;
  }
  function handleTogglePresent(entry: QueueEntry, present: boolean) {
    if (present && !entry.identityNote && hasDuplicateName(entry)) {
      setIdentityNotePrompt(entry);
      return;
    }
    togglePresent.mutate({ id: entry.id, present });
  }

  function isLate(e: QueueEntry) {
    return e.isAppt && !!e.apptAt && new Date(e.apptAt) < now;
  }
  const lateCount = waitingList.filter(isLate).length;
  // An appointment booked hours/days earlier has not been waiting that whole
  // time. Its wait begins only when marked Arrived; non-present appointments
  // do not participate in the operational longest-wait metric.
  const activelyWaiting = waitingList.filter((entry) => !entry.isAppt || entry.present);
  const waitMinutes = (entry: QueueEntry) => minutesBetween(new Date(entry.isAppt && entry.presentCheckedAt ? entry.presentCheckedAt : entry.createdAt), now);
  const staleWaiting = activelyWaiting.filter((entry) => waitMinutes(entry) >= 12 * 60);
  const operationalWaiting = activelyWaiting.filter((entry) => waitMinutes(entry) < 12 * 60);
  const longestWaitMinutes = operationalWaiting.reduce((max, entry) => Math.max(max, waitMinutes(entry)), 0);

  const serviceTeam = onShiftTeam.filter((member) => member.role !== 'front_desk');
  const availableTeam = serviceTeam.filter((member) => member.status === 'available');
  const usedReadyStaff = new Set<string>();
  // Consume staff matches in the server's priority order (appointment-SLA-protected
  // entries first) rather than plain display order — falls back to display order
  // whenever nothing is protected, i.e. no visible change in the common case.
  const priorityIndex = new Map((board.data?.priorityOrder ?? []).map((id, index) => [id, index]));
  const priorityWaitingList = [...waitingList].sort((a, b) => (priorityIndex.get(a.id) ?? Infinity) - (priorityIndex.get(b.id) ?? Infinity));
  const readyMatches = priorityWaitingList
    .filter((entry) => entry.present && entry.readyOverride !== false)
    .map((entry) => {
      const recommended = availableTeam.find((member) => member.locationStaffId === entry.recommendedStaffId && !usedReadyStaff.has(member.locationStaffId));
      const assigned = availableTeam.find((member) => member.locationStaffId === entry.assignedStaffId && !usedReadyStaff.has(member.locationStaffId));
      const staff = recommended ?? assigned ?? availableTeam.find((member) => !usedReadyStaff.has(member.locationStaffId)) ?? null;
      if (staff) usedReadyStaff.add(staff.locationStaffId);
      return staff || entry.readyOverride === true ? { entry, staff } : null;
    })
    .filter((match): match is { entry: QueueEntry; staff: TeamMember | null } => Boolean(match));

  function openStart(entry: QueueEntry, suggestedStaffId?: string) {
    setSuggestedStartStaffId(suggestedStaffId ?? null);
    setStartEntry(entry);
  }

  function openCheckout(entry: QueueEntry) {
    setCheckoutEntry(entry);
  }

  // Elapsed time for whoever's currently in someone's chair, keyed by staff —
  // powers the "Cutting · Xm" hint on the staff-status strip.
  const elapsedByStaffId = new Map(
    (board.data?.nowServing ?? [])
      .filter((e) => e.assignedStaffId)
      .map((e) => [e.assignedStaffId as string, minutesBetween(new Date(e.updatedAt), now)]),
  );

  const readyIds = new Set(readyMatches.map((match) => match.entry.id));

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId || !board.data) return;
    const currentOrder = (localWaitingOrder ?? board.data.waiting.map((w) => w.id)).slice();
    const from = currentOrder.indexOf(dragId);
    const to = currentOrder.indexOf(targetId);
    currentOrder.splice(from, 1);
    currentOrder.splice(to, 0, dragId);
    setLocalWaitingOrder(currentOrder);
    reorder.mutate(currentOrder);
    setDragId(null);
    setDragOverZone(null);
  }

  // Dropping anywhere in the Ready column (not just the empty-slot box) marks the entry ready.
  function handleDropToReady() {
    if (dragId) toggleReady.mutate({ id: dragId, ready: true });
    setDragId(null);
    setDragOverZone(null);
  }

  // Dropping a ready card back onto the Waiting column un-readies it; dropping an
  // already-waiting entry there (row-level handleDrop stops propagation first) is a no-op.
  function handleDropToWaiting() {
    if (dragId && readyIds.has(dragId)) toggleReady.mutate({ id: dragId, ready: false });
    setDragId(null);
    setDragOverZone(null);
  }

  // Dropping any waiting/ready entry onto an on-floor staff chip opens Start prefilled with
  // that barber; dropping an in-service entry there opens Reassign prefilled the same way.
  function handleDropOnStaff(staffId: string) {
    if (dragId) {
      const waitingEntry = waitingList.find((entry) => entry.id === dragId);
      if (waitingEntry) {
        openStart(waitingEntry, staffId);
      } else {
        const servingEntry = board.data?.nowServing.find((entry) => entry.id === dragId);
        if (servingEntry) {
          setSuggestedReassignStaffId(staffId);
          setReassignEntry(servingEntry);
        }
      }
    }
    setDragId(null);
    setDragOverZone(null);
  }

  return (
    // On wide screens the Floor is a fixed-height dashboard: header, on-floor
    // strip and Activity stay put while each board column scrolls internally,
    // so reception never scrolls the whole page to see the queue. Below xl it
    // falls back to natural page flow (stacked columns, normal scroll).
    <div className="mx-auto flex max-w-[1560px] flex-col gap-5 xl:h-[calc(100vh-5.75rem)]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfd9cd] pb-4">
        <div>
          <p className="text-sm font-medium text-[#605f5a]">{now.toLocaleDateString([], { timeZone: board.data?.timezone, weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <div className="mt-1 flex items-baseline gap-3">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Floor</h1>
            <span className="text-sm text-gray-500">Updated just now</span>
            {shopStatus.data && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${shopStatus.data.state === 'open' ? 'bg-[#e4eee7] text-[#315c4f]' : 'bg-[#eee9df] text-[#766d60]'}`}>{shopStatus.data.state === 'open' ? 'Store open' : shopStatus.data.state === 'closed' ? 'Store closed' : 'Opening not logged'}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 hidden items-center gap-2 text-sm text-gray-600 md:flex">
            <span><strong className="text-gray-900">{waitingList.length}</strong> queued</span>
            <span>·</span>
            <span><strong className="text-gray-900">{readyMatches.length}</strong> ready</span>
            <span>·</span>
            <span><strong className="text-gray-900">{board.data?.nowServing.length ?? 0}</strong> in service</span>
          </div>
          <Button onClick={() => setShowCheckIn('appointment')}>Appointment</Button>
          <Button variant="solid" onClick={() => setShowCheckIn('walkin')}>＋ Walk-in</Button>
          <RowMenu items={[
            ...(shopStatus.data?.state !== 'open' ? [{ label: shopStatus.data?.state === 'closed' ? 'Reopen store' : 'Open store', onClick: () => setShowOpenShop(true) }] : []),
            ...(canManage && shopStatus.data?.state === 'open' ? [{ label: 'Close up shop', onClick: () => setShowCloseShop(true) }] : []),
          ]} />
        </div>
      </header>

      <SanitationReminder state={sanitation.data} pending={snoozeSanitation.isPending || completeSanitation.isPending} onSnooze={() => snoozeSanitation.mutate()} onComplete={() => completeSanitation.mutate()} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ddd7ca] bg-white/55 px-3 py-2">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#77736b]">On floor</span>
        {onShiftTeam.length === 0 && <span className="py-1 text-sm text-gray-400">No staff clocked in yet.</span>}
        {onShiftTeam.map((member) => {
          const elapsed = member.status === 'busy' ? elapsedByStaffId.get(member.locationStaffId) : undefined;
          const zone = `staff-${member.locationStaffId}`;
          const droppable = !!dragId;
          return (
            <div
              key={member.locationStaffId}
              onDragOver={(event) => { if (droppable) event.preventDefault(); }}
              onDragEnter={() => { if (droppable) setDragOverZone(zone); }}
              onDragLeave={() => setDragOverZone((current) => (current === zone ? null : current))}
              onDrop={(event) => { event.stopPropagation(); if (droppable) handleDropOnStaff(member.locationStaffId); }}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                dragOverZone === zone ? 'border-[#315f52] bg-[#edf3ef] ring-2 ring-[#315f52]/20' : droppable ? 'border-[#315f52]/40 bg-white' : 'border-[#dedbd2] bg-white'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${STAFF_DOT[member.status]}`} />
              <span className="text-xs font-medium text-[#383d3a]">{member.fullName}</span>
              {elapsed !== undefined && <span className="text-[11px] text-gray-400">· {elapsed}m</span>}
              <StatusDropdown status={member.status} onChange={(status) => setStatus.mutate({ staffId: member.locationStaffId, status })} />
            </div>
          );
        })}
        <div className="ml-auto"><ClockInDropdown offStaff={offShiftTeam} onClockIn={(id) => clockIn.mutate(id)} /></div>
      </div>

      <div className="grid items-start gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.12fr_.82fr_1.12fr] xl:items-stretch">
        <section
          onDragOver={(event) => { if (dragId) event.preventDefault(); }}
          onDragEnter={() => { if (dragId) setDragOverZone('waiting'); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverZone((current) => (current === 'waiting' ? null : current)); }}
          onDrop={(event) => { event.stopPropagation(); handleDropToWaiting(); }}
          className={`overflow-hidden rounded-2xl border bg-white/55 shadow-[0_10px_30px_rgba(62,50,32,0.035)] transition xl:flex xl:min-h-0 xl:flex-col ${dragOverZone === 'waiting' ? 'border-[#315f52] ring-2 ring-[#315f52]/15' : 'border-[#ddd7cc]'}`}
        >
          <div className="border-b border-[#e4ded3] px-4 py-4 xl:shrink-0">
            <div className="flex items-baseline gap-3">
              <h2 className="font-serif text-2xl text-[#1b211e]">Waiting</h2>
              <span className="text-base text-[#8c6f58]">{waitingList.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
              {lateCount > 0 && <span className="font-medium text-[#b84b24]">{lateCount} need attention</span>}
              {operationalWaiting.length > 0 && <span>Longest wait <strong className={longestWaitMinutes >= 45 ? 'text-[#b84b24]' : 'text-gray-800'}>{durationLabel(longestWaitMinutes)}</strong></span>}
              <span className="ml-auto">Priority order ↕</span>
            </div>
          </div>
          <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {waitingList.length === 0 && <div className="px-5 py-12 text-center text-sm text-gray-400">No one is waiting.</div>}
            {waitingList.map((entry, index) => {
              const wait = (!entry.isAppt || entry.present) ? waitMinutes(entry) : 0;
              const late = isLate(entry);
              const urgent = wait >= 60 || late;
              return (
                <div
                  key={entry.id}
                  draggable
                  onDragStart={() => setDragId(entry.id)}
                  onDragEnd={() => { setDragId(null); setDragOverZone(null); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.stopPropagation(); handleDrop(entry.id); }}
                  className={`grid cursor-grab grid-cols-[4px_34px_minmax(0,1fr)_auto_28px] items-center gap-2 border-b border-[#e7e1d7] py-3 pr-2 last:border-0 active:cursor-grabbing ${dragId === entry.id ? 'opacity-40' : 'hover:bg-white/75'}`}
                >
                  <span className={`h-full min-h-12 rounded-r-full ${urgent ? 'bg-[#c84e26]' : wait >= 40 ? 'bg-[#cf8b17]' : 'bg-transparent'}`} />
                  <span className="font-serif text-xl tabular-nums text-[#222824]">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {entry.clientId ? <button className="truncate text-left text-sm font-semibold hover:text-[#175642]" onClick={() => setClientPreviewId(entry.clientId)}>{displayName(entry)}</button> : <span className="truncate text-sm font-semibold">{displayName(entry)}</span>}
                      {entry.isAppt && <Pill tone="gray">Appt</Pill>}
                      {late && <Pill tone="red">Late</Pill>}
                      {entry.apptSlaProtected && <Pill tone="amber">⏰ Seat by {timeLabel(entry.apptSlaDeadline ?? null)}</Pill>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500">{entry.serviceName} · {entry.assignedStaffName ?? 'Any barber'}{entry.identityNote ? ` · ${entry.identityNote}` : ''}</div>
                    <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] text-gray-400">
                      <input type="checkbox" className="h-3.5 w-3.5" checked={entry.present} onChange={(event) => handleTogglePresent(entry, event.target.checked)} />
                      {entry.present ? `Arrived ${timeLabel(entry.presentCheckedAt)}` : 'Mark arrived'}
                    </label>
                  </div>
                  <div className="text-right text-xs">
                    {wait > 0 && <div className={`font-semibold tabular-nums ${urgent ? 'text-[#c14b25]' : wait >= 40 ? 'text-[#b36f0e]' : 'text-gray-600'}`}>{durationLabel(wait)}</div>}
                    <div className="mt-1 whitespace-nowrap text-gray-500">
                      {entry.isAppt && entry.present && <span className="mr-1 text-[#5c7c6c]">Walk-in est: {timeLabel(entry.estimatedStart)} ·</span>}
                      {entry.isAppt ? timeLabel(entry.apptAt) : `~${timeLabel(entry.estimatedStart)}`}
                    </div>
                    <button className="mt-1 font-medium text-[#175642] hover:underline" onClick={() => openStart(entry)}>Start</button>
                  </div>
                  <RowMenu items={[{ label: 'Reassign', onClick: () => { setSuggestedReassignStaffId(null); setReassignEntry(entry); } }, { label: 'Change service', onClick: () => setChangeServiceEntry(entry) }, { label: 'Mark no-show', onClick: () => noShow.mutate(entry.id), hidden: entry.present }, { label: 'Mark abandoned', onClick: () => abandon.mutate(entry.id), hidden: !entry.present }, { label: 'Cancel', onClick: () => cancel.mutate(entry.id), destructive: true }]} />
                </div>
              );
            })}
          </div>
        </section>

        <section
          onDragOver={(event) => { if (dragId) event.preventDefault(); }}
          onDragEnter={() => { if (dragId) setDragOverZone('ready'); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverZone((current) => (current === 'ready' ? null : current)); }}
          onDrop={(event) => { event.stopPropagation(); handleDropToReady(); }}
          className={`rounded-2xl border p-3 shadow-[0_10px_30px_rgba(43,76,60,0.06)] transition xl:flex xl:min-h-0 xl:flex-col ${dragOverZone === 'ready' ? 'border-[#315f52] bg-[#e4eee7] ring-2 ring-[#315f52]/15' : 'border-[#b9cdbd] bg-[#edf3ec]'}`}
        >
          <div className="flex items-baseline gap-3 px-2 pb-3 pt-1 xl:shrink-0">
            <h2 className="font-serif text-2xl text-[#1b211e]">Ready to seat</h2>
            <span className="text-base text-[#79695c]">{readyMatches.length}</span>
          </div>
          <div className="space-y-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
            {readyMatches.map(({ entry, staff }, index) => (
              <div
                key={entry.id}
                draggable
                onDragStart={() => setDragId(entry.id)}
                onDragEnd={() => { setDragId(null); setDragOverZone(null); }}
                className={`cursor-grab rounded-xl border p-3 shadow-sm active:cursor-grabbing ${entry.apptSlaProtected ? 'border-amber-300 bg-amber-50/60' : 'border-[#bfd0c2] bg-white/70'} ${dragId === entry.id ? 'opacity-40' : ''}`}
              >
                {entry.apptSlaProtected && <div className="mb-2"><Pill tone="amber">⏰ Appointment — seat by {timeLabel(entry.apptSlaDeadline ?? null)}</Pill></div>}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dce8de] font-serif text-lg text-[#174f3c]">{staff?.fullName.charAt(0) ?? '·'}</span>
                    <span className="min-w-0 text-sm font-semibold leading-tight">{staff?.fullName ?? 'Barber pending'}</span>
                  </div>
                  <div className="flex items-center text-[#527466]"><span className="h-px w-5 bg-[#7e9c8f]" /><span className="grid h-5 w-5 place-items-center rounded-full border border-[#56796b] text-[10px]">✓</span><span className="h-px w-5 bg-[#7e9c8f]" /></div>
                  <div className="min-w-0 text-right leading-tight"><span className="font-serif text-lg tabular-nums">{String(waitingList.indexOf(entry) + 1).padStart(2, '0')}</span><span className="ml-2 text-sm font-semibold">{displayName(entry)}</span></div>
                </div>
                <div className="mt-3 text-center"><div className="text-sm text-gray-700">{entry.serviceName}</div><div className="mt-0.5 text-[11px] text-gray-500">{staff ? (entry.matchReason === 'familiar_barber' ? `Familiar barber${entry.continuityVisitCount ? ` · ${entry.continuityVisitCount} prior visit${entry.continuityVisitCount === 1 ? '' : 's'}` : ''}` : entry.matchReason === 'team_variety' ? 'Team variety match' : entry.matchReason === 'requested' ? 'Requested barber' : index === 0 ? 'Longest waiting · next available' : 'Available now') : 'Ready when a barber opens up'}</div></div>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <Button variant={staff ? 'solid' : 'default'} onClick={() => openStart(entry, staff?.locationStaffId)}>{staff ? `Seat with ${staff.fullName.split(' ')[0]}` : 'Choose barber'}</Button>
                  <Button variant="ghost" onClick={() => toggleReady.mutate({ id: entry.id, ready: false })}>Back to waiting</Button>
                </div>
              </div>
            ))}
            <div className={`rounded-xl border border-dashed px-4 py-8 text-center transition ${dragId ? 'border-[#315f52] bg-white/70' : 'border-[#9eb7a6]'}`}>
              <div className="text-2xl text-[#376653]">♙</div><p className="mt-2 text-sm font-medium text-[#376653]">Drag a waiting client here</p><p className="mt-1 text-xs text-[#6d8077]">This slot stays open even when every barber is busy.</p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#ddd7cc] bg-white/55 shadow-[0_10px_30px_rgba(62,50,32,0.035)] xl:flex xl:min-h-0 xl:flex-col">
          <div className="flex items-baseline gap-3 border-b border-[#e4ded3] px-4 py-4 xl:shrink-0">
            <h2 className="font-serif text-2xl text-[#1b211e]">In service</h2>
            <span className="text-base text-[#8c6f58]">{board.data?.nowServing.length ?? 0}</span>
          </div>
          <div className="space-y-2 p-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {board.data?.nowServing.length === 0 && <div className="px-4 py-12 text-center text-sm text-gray-400">No one is in a chair right now.</div>}
            {board.data?.nowServing.map((entry) => {
              const started = new Date(entry.serviceStartedAt ?? entry.updatedAt);
              const elapsed = minutesBetween(started, now);
              const eta = new Date(started.getTime() + entry.serviceDurationMinutes * 60000);
              const progress = Math.min(100, Math.max(4, (elapsed / Math.max(1, entry.serviceDurationMinutes)) * 100));
              const overrunning = now > eta;
              return (
                <div
                  key={entry.id}
                  draggable
                  onDragStart={() => setDragId(entry.id)}
                  onDragEnd={() => { setDragId(null); setDragOverZone(null); }}
                  title="Drag onto an on-floor barber to reassign"
                  className={`cursor-grab rounded-xl border border-[#e1dbd0] bg-white/70 px-3 py-3 active:cursor-grabbing ${dragId === entry.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e1e9e1] font-serif text-lg text-[#315d4e]">{entry.assignedStaffName?.charAt(0) ?? 'S'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="truncate text-sm font-semibold">{entry.assignedStaffName ?? 'Professional'}</span><span className="text-gray-300">/</span><span className="truncate text-xs text-gray-500">{displayName(entry)}</span></div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-gray-500"><span className="truncate">{entry.serviceName}</span><span className={`whitespace-nowrap tabular-nums ${overrunning ? 'font-medium text-[#b84b24]' : ''}`}>{elapsed}m · {overrunning ? 'overdue' : `ends ${timeLabel(eta.toISOString())}`}</span></div>
                    </div>
                    <button aria-label={`Complete service for ${displayName(entry)}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#49645a] text-sm text-[#274f41] hover:bg-[#edf3ef]" onClick={() => openCheckout(entry)}>✓</button>
                    <RowMenu items={[{ label: 'Reassign', onClick: () => { setSuggestedReassignStaffId(null); setReassignEntry(entry); } }, { label: 'Return to top of waiting', onClick: () => returnToWaiting.mutate({ id: entry.id, position: 'top' }) }, { label: 'Return to original position', onClick: () => returnToWaiting.mutate({ id: entry.id, position: 'original' }) }, { label: 'Mark abandoned', onClick: () => abandon.mutate(entry.id), destructive: true }, { label: 'Cancel service', onClick: () => cancel.mutate(entry.id), destructive: true }]} />
                  </div>
                  <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-[#d9d7d0]"><div className={`h-full rounded-full ${overrunning ? 'bg-[#c84e26]' : 'bg-[#c98310]'}`} style={{ width: `${progress}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div>
        <button
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 mb-2"
          onClick={() => setActivityOpen((v) => !v)}
        >
          <span className={`transition-transform ${activityOpen ? 'rotate-90' : ''}`}>›</span> Activity
        </button>
        {/* Collapsed by default — it's supporting/audit information, not
            something reception needs to scan continuously like the queue above. */}
        {activityOpen && (
        <Card className={(activity.data?.length ?? 0) > 4 ? 'max-h-[147px] overflow-y-auto' : ''}>
          {activity.data?.map((ev) => (
            <div key={ev.id} className="flex h-9 items-center justify-between gap-4 border-b border-black/5 last:border-0 px-4 text-sm">
              <span className="min-w-0 flex-1 truncate">{ev.description}</span>
              {confirmingUndo === String(ev.id) ? (
                /* Cancel sits exactly where Undo was (rightmost); Confirm to its left. */
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <button
                    className="font-medium text-red-600 hover:underline"
                    onClick={() => {
                      undo.mutate(String(ev.id));
                      setConfirmingUndo(null);
                    }}
                  >
                    Confirm undo
                  </button>
                  <button className="text-gray-400 underline hover:text-black" onClick={() => setConfirmingUndo(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 whitespace-nowrap text-gray-400">
                  <span>{shortDate(ev.created_at)}</span>
                  {!ev.event_type.endsWith('_undone') && (
                    <button className="underline hover:text-black" onClick={() => setConfirmingUndo(String(ev.id))}>
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
        )}
      </div>

      {clientPreviewId && <ClientPreviewPopover clientId={clientPreviewId} locationId={params.locationId} onClose={() => setClientPreviewId(null)} />}

      {identityNotePrompt && (
        <IdentityNotePanel
          name={displayName(identityNotePrompt)}
          onClose={() => setIdentityNotePrompt(null)}
          onSave={(note) => {
            togglePresent.mutate({ id: identityNotePrompt.id, present: true, identityNote: note });
            setIdentityNotePrompt(null);
          }}
        />
      )}

      {showCheckIn && services.data && (
        <CheckInPanel
          isAppointment={showCheckIn === 'appointment'}
          services={services.data}
          team={(board.data?.team ?? []).filter((member) => member.role !== 'front_desk')}
          onClose={() => setShowCheckIn(null)}
          onDone={invalidate}
        />
      )}

      {startEntry && services.data && <StartPanel entry={startEntry} services={services.data} suggestedStaffId={suggestedStartStaffId} onClose={() => { setStartEntry(null); setSuggestedStartStaffId(null); }} onDone={invalidate} />}

      {reassignEntry && (
        <ReassignPanel
          entry={reassignEntry}
          suggestedStaffId={suggestedReassignStaffId}
          onClose={() => { setReassignEntry(null); setSuggestedReassignStaffId(null); }}
          onDone={invalidate}
        />
      )}

      {changeServiceEntry && services.data && (
        <ChangeServicePanel entry={changeServiceEntry} services={services.data} onClose={() => setChangeServiceEntry(null)} onDone={invalidate} />
      )}

      {checkoutEntry && (
        <CheckoutPanel entry={checkoutEntry} locationId={params.locationId} onClose={() => setCheckoutEntry(null)} onDone={invalidate} />
      )}

      {showCloseShop && <CloseShopPanel onClose={() => setShowCloseShop(false)} onDone={invalidate} />}
      {showOpenShop && <OpenShopPanel onClose={() => setShowOpenShop(false)} onDone={invalidate} />}
    </div>
  );
}

function Modal({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className={`max-h-[86vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function IdentityNotePanel({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (note?: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal onClose={onClose}>
      <h3 className="mb-1 font-semibold">Another {name} is waiting</h3>
      <p className="mb-4 text-sm text-gray-500">Add a short description so staff can tell them apart on the Floor.</p>
      <input
        autoFocus
        className="mb-4 w-full rounded-lg border border-black/15 px-3 py-2"
        placeholder='e.g. "blue jacket", "with kids"'
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') onSave(note.trim() || undefined); }}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={() => onSave(undefined)}>Skip</Button>
        <Button variant="solid" onClick={() => onSave(note.trim() || undefined)}>Save</Button>
      </div>
    </Modal>
  );
}

function CheckoutShell({ children, busy, onClose }: { children: React.ReactNode; busy: boolean; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Something (browser autofill focus, a form control receiving focus on
  // mount) can auto-scroll this panel past its own header/first section
  // right after it opens — always snap back to the top so staff see the
  // full "Complete service" flow from the start, not partway down it.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);
  // Centered and sized to the viewport (not anchored to the clicked button):
  // the two-column layout below keeps it short enough to fit most screens
  // without scrolling, and the max-height + internal scroll (with the sticky
  // footer) is the fallback on short viewports.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={busy ? undefined : onClose}>
      <div
        ref={scrollRef}
        role="dialog"
        aria-modal="true"
        aria-label="Complete service"
        className="max-h-[calc(100vh-2rem)] w-[min(960px,100%)] overflow-y-auto rounded-2xl bg-[#fffefa] p-5 shadow-[0_24px_70px_rgba(27,32,29,0.24)] ring-1 ring-black/10"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function CheckInPanel({
  isAppointment,
  services,
  team,
  onClose,
  onDone,
}: {
  isAppointment: boolean;
  services: Service[];
  team: TeamMember[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'phone' | 'guest'>('phone');
  const [phone, setPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [needsNewClientName, setNeedsNewClientName] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>(services[0]?.id ? [services[0].id] : []);
  const [requestedStaffId, setRequestedStaffId] = useState<string>('');
  const [apptDate, setApptDate] = useState(new Date().toISOString().slice(0, 10));
  const [apptTime, setApptTime] = useState('10:00');
  const [error, setError] = useState<string | null>(null);

  const checkIn = useMutation({
    mutationFn: () =>
      api.post('/queue/check-in', {
        mode,
        phone: mode === 'phone' ? phone : undefined,
        guestName: mode === 'guest' ? guestName : undefined,
        newClientName: needsNewClientName ? newClientName : undefined,
        serviceId: serviceIds[0],
        serviceIds,
        requestedStaffId: requestedStaffId || undefined,
        isAppointment,
        apptAt: isAppointment ? new Date(`${apptDate}T${apptTime}:00`).toISOString() : undefined,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.body?.code === 'NEW_CLIENT_NAME_REQUIRED') {
        setNeedsNewClientName(true);
        setError(null);
      } else if (err instanceof ApiError) {
        setError(err.body?.message ?? 'Check-in failed');
      }
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-4">{isAppointment ? 'Book appointment' : 'Walk-in check-in'}</h3>
      <div className="flex gap-2 mb-4">
        <Button variant={mode === 'phone' ? 'solid' : 'default'} onClick={() => setMode('phone')}>
          Phone
        </Button>
        <Button variant={mode === 'guest' ? 'solid' : 'default'} onClick={() => setMode('guest')}>
          Guest
        </Button>
      </div>

      {mode === 'phone' ? (
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3"
          placeholder="313-555-1212"
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
        />
      ) : (
        <input
          className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3"
          placeholder="Guest name"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
      )}

      {needsNewClientName && (
        <div className="mb-3">
          <p className="text-sm text-amber-700 mb-1">This number isn't on file — enter a name to create a profile.</p>
          <input
            className="w-full border border-black/15 rounded-lg px-3 py-2"
            placeholder="Client name"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
          />
        </div>
      )}

      {isAppointment && (
        <div className="flex gap-2 mb-3">
          <input type="date" className="flex-1 border border-black/15 rounded-lg px-3 py-2" value={apptDate} onChange={(e) => setApptDate(e.target.value)} />
          <input type="time" className="flex-1 border border-black/15 rounded-lg px-3 py-2" value={apptTime} onChange={(e) => setApptTime(e.target.value)} />
        </div>
      )}

      <ServiceMultiPicker services={services} selectedIds={serviceIds} onChange={setServiceIds} />

      <ProfessionalPicker options={team} selected={requestedStaffId} isAppointment={isAppointment} onSelect={setRequestedStaffId} />

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => checkIn.mutate()} disabled={!serviceIds.length || checkIn.isPending}>
          {isAppointment ? 'Book' : 'Check in'}
        </Button>
      </div>
    </Modal>
  );
}

/** Fetches who's actually pickable for this entry right now — available-only for an
    active (in_service) entry, clocked-in for a waiting walk-in, scheduled-for-that-time
    for a waiting appointment. See QueueService.eligibleStaffForEntry on the backend. */
function useEligibleStaff(entryId: string) {
  return useQuery({
    queryKey: ['queue', 'eligible-staff', entryId],
    queryFn: () => api.get<{ locationStaffId: string; fullName: string }[]>(`/queue/${entryId}/eligible-staff`),
  });
}

function StaffPickerButtons({
  options,
  selected,
  onSelect,
}: {
  options: { locationStaffId: string; fullName: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {options.map((t) => (
        <button
          key={t.locationStaffId}
          type="button"
          onClick={() => onSelect(t.locationStaffId)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            selected === t.locationStaffId ? 'border-black bg-black text-white' : 'border-black/15 bg-white text-ink hover:border-black/40'
          }`}
        >
          {t.fullName}
        </button>
      ))}
    </div>
  );
}

function StartPanel({ entry, services, suggestedStaffId, onClose, onDone }: { entry: QueueEntry; services: Service[]; suggestedStaffId?: string | null; onClose: () => void; onDone: () => void }) {
  const eligible = useEligibleStaff(entry.id);
  const options = eligible.data ?? [];
  const [pickedStaffId, setPickedStaffId] = useState<string | null>(null);
  const staffId = pickedStaffId
    ?? (suggestedStaffId && options.some((option) => option.locationStaffId === suggestedStaffId) ? suggestedStaffId : null)
    ?? (entry.assignedStaffId && options.some((option) => option.locationStaffId === entry.assignedStaffId) ? entry.assignedStaffId : (options[0]?.locationStaffId ?? ''));
  const [serviceNotes, setServiceNotes] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>(entry.serviceIds?.length ? entry.serviceIds : [entry.serviceId]);

  const start = useMutation({
    mutationFn: () => api.post(`/queue/${entry.id}/start`, { staffId, serviceId: serviceIds[0], serviceIds, serviceNotes }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-1">Start — {displayName(entry)}</h3>
      <div className="mb-4"><ServiceMultiPicker services={services} selectedIds={serviceIds} onChange={setServiceIds} /><span className="mt-1 block text-xs text-gray-400">Confirm every service being performed so timing and reporting stay accurate.</span></div>
      {eligible.isLoading && <p className="text-sm text-gray-500 mb-3">Loading eligible barbers…</p>}
      {options.length === 0 && !eligible.isLoading && (
        <p className="text-sm text-amber-700 mb-3">
          {entry.isAppt ? 'No one is scheduled to work at this appointment time.' : 'No one is currently clocked in.'}
        </p>
      )}
      <StaffPickerButtons options={options} selected={staffId} onSelect={setPickedStaffId} />
      <textarea
        className="w-full border border-black/15 rounded-lg px-3 py-2 mb-4"
        placeholder="Service notes"
        value={serviceNotes}
        onChange={(e) => setServiceNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => start.mutate()} disabled={!staffId || !serviceIds.length || start.isPending}>
          Start
        </Button>
      </div>
    </Modal>
  );
}

function ReassignPanel({ entry, suggestedStaffId, onClose, onDone }: { entry: QueueEntry; suggestedStaffId?: string | null; onClose: () => void; onDone: () => void }) {
  const eligible = useEligibleStaff(entry.id);
  const options = eligible.data ?? [];
  const [pickedStaffId, setPickedStaffId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const staffId = pickedStaffId
    ?? (suggestedStaffId && options.some((o) => o.locationStaffId === suggestedStaffId) ? suggestedStaffId : null)
    ?? (entry.assignedStaffId && options.some((o) => o.locationStaffId === entry.assignedStaffId) ? entry.assignedStaffId : '');

  const reassign = useMutation({
    mutationFn: () => api.post(`/queue/${entry.id}/reassign`, { newStaffId: staffId }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? (err.body?.message ?? 'Could not reassign this service') : 'Could not reassign this service'),
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-1">Reassign — {displayName(entry)}</h3>
      <p className="text-sm text-gray-500 mb-4">Currently: {entry.assignedStaffName ?? 'No preference'}</p>
      {eligible.isLoading && <p className="text-sm text-gray-500 mb-3">Loading eligible barbers…</p>}
      {options.length === 0 && !eligible.isLoading && (
        <p className="text-sm text-amber-700 mb-3">
          {entry.status === 'in_service'
            ? 'No one else is currently available.'
            : entry.isAppt
              ? 'No one is scheduled to work at this appointment time.'
              : 'No one is currently clocked in.'}
        </p>
      )}
      <StaffPickerButtons options={options} selected={staffId} onSelect={setPickedStaffId} />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => reassign.mutate()} disabled={!staffId || reassign.isPending}>
          Reassign
        </Button>
      </div>
    </Modal>
  );
}

function ChangeServicePanel({
  entry,
  services,
  onClose,
  onDone,
}: {
  entry: QueueEntry;
  services: Service[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [serviceIds, setServiceIds] = useState<string[]>(entry.serviceIds?.length ? entry.serviceIds : [entry.serviceId]);

  const changeService = useMutation({
    mutationFn: () => api.post(`/queue/${entry.id}/service`, { serviceId: serviceIds[0], serviceIds }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-1">Change service — {displayName(entry)}</h3>
      <p className="text-sm text-gray-500 mb-4">Add or remove services before this client is seated.</p>
      <div className="mb-4"><ServiceMultiPicker services={services} selectedIds={serviceIds} onChange={setServiceIds} /></div>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => changeService.mutate()} disabled={!serviceIds.length || changeService.isPending}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

interface ClientProfile {
  client: {
    id: string;
    name: string;
    phone_display: string | null;
    referral_source: string | null;
    notes: string | null;
    allergy_flag: boolean;
  };
  recordedVisits: number;
  recordedSpend: number;
  serviceHistory: { transactionId: string; date: string; serviceName: string; staffName: string | null; price: string; tip: string }[];
}

/** Reception shouldn't have to leave the queue to see who they're talking to —
    surfaces the same notes/allergy/history data the full Clients page shows. */
function ClientPreviewPopover({ clientId, locationId, onClose }: { clientId: string; locationId: string; onClose: () => void }) {
  const profile = useQuery({ queryKey: ['clients', clientId], queryFn: () => api.get<ClientProfile>(`/clients/${clientId}`) });

  return (
    <Modal onClose={onClose}>
      {!profile.data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold">{profile.data.client.name}</h3>
            {profile.data.client.allergy_flag && <Pill tone="red">Allergy flag</Pill>}
          </div>
          <p className="text-sm text-gray-500 mb-4">{profile.data.client.phone_display}</p>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">Recorded visits</div>
              <div className="font-medium">{profile.data.recordedVisits}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">Recorded spend</div>
              <div className="font-medium">${profile.data.recordedSpend.toFixed(2)}</div>
            </div>
          </div>

          {profile.data.client.notes && (
            <div className="mb-4">
              <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Notes</div>
              <p className="text-sm">{profile.data.client.notes}</p>
            </div>
          )}

          {profile.data.serviceHistory.length > 0 && (
            <div className="mb-4">
              <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Recent visits</div>
              <div className="space-y-1">
                {profile.data.serviceHistory.slice(0, 3).map((v) => (
                  <div key={v.transactionId} className="flex justify-between text-sm text-gray-600">
                    <span>
                      {new Date(v.date).toLocaleDateString()} · {v.serviceName} {v.staffName ? `with ${v.staffName}` : ''}
                    </span>
                    <span>${Number(v.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <a href={`/locations/${locationId}/clients/${clientId}`} className="text-sm underline text-gray-500 hover:text-black">
              Open full profile
            </a>
            <Button onClick={onClose}>Close</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CheckoutPanel({
  entry,
  locationId,
  onClose,
  onDone,
}: {
  entry: QueueEntry;
  locationId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tip, setTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'external'>('cash');
  const [showExternal, setShowExternal] = useState(false);
  const [externalReference, setExternalReference] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  const [retailItems, setRetailItems] = useState<Product[]>([]);
  const [extraServices, setExtraServices] = useState<Service[]>(() =>
    (entry.services ?? []).slice(1).map((service) => ({
      id: service.id,
      name: service.name,
      duration_minutes: service.durationMinutes,
      price: service.price,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const cardTokenizer = useRef<null | (() => Promise<string>)>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [primaryServiceId, setPrimaryServiceId] = useState(entry.serviceId);

  const config = useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => api.get<BrowserPaymentConfig>('/payments/config'),
  });
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const products = useQuery({ queryKey: ['settings', 'products'], queryFn: () => api.get<Product[]>('/settings/products') });
  const featureSettings = useQuery({ queryKey: ['settings', 'feature-settings'], queryFn: () => api.get<{ retailProductsEnabled: boolean; discountCodesEnabled: boolean }>('/settings/feature-settings') });
  const taxConfig = useQuery({ queryKey: ['settings', 'tax-config'], queryFn: () => api.get<{ services_taxable: boolean }>('/settings/tax-config') });
  const discountCodes = useQuery({
    queryKey: ['settings', 'discount-codes'],
    queryFn: () => api.get<{ code: string; discount_type: 'percent' | 'flat'; value: string; active: boolean }[]>('/settings/discount-codes'),
  });
  const pricingPolicy = useQuery({
    queryKey: ['settings', 'pricing-policy'],
    queryFn: () => api.get<{ barberRequestMode: 'same' | 'per_staff' | 'flat'; flatSurchargeAmount: number }>('/settings/pricing-policy'),
  });
  const roster = useQuery({
    queryKey: ['settings', 'staff'],
    queryFn: () => api.get<{ locationStaffId: string; priceTierAmount: string }[]>('/settings/staff'),
  });
  const service = services.data?.find((s) => s.id === primaryServiceId);
  const servicePrice = service ? Number(service.price) : 0;
  const extraServicesTotal = extraServices.reduce((sum, s) => sum + Number(s.price), 0);
  const retailTotal = retailItems.reduce((sum, p) => sum + Number(p.price), 0);

  // Requesting a barber by name (as opposed to "any available") can carry a
  // premium, per the location's owner-configured pricing policy.
  const requestWasFulfilled = !!entry.requestedStaffId && entry.requestedStaffId === entry.assignedStaffId;
  const assignedStaffTier = roster.data?.find((r) => r.locationStaffId === entry.requestedStaffId);
  const barberPremium =
    requestWasFulfilled && pricingPolicy.data
      ? pricingPolicy.data.barberRequestMode === 'flat'
        ? pricingPolicy.data.flatSurchargeAmount
        : pricingPolicy.data.barberRequestMode === 'per_staff'
          ? Number(assignedStaffTier?.priceTierAmount ?? 0)
          : 0
      : 0;

  // "Total (before tip)" — updates live as services/products are added or removed.
  const beforeTip = servicePrice + extraServicesTotal + retailTotal + barberPremium;

  // Client-side preview only — the server independently validates and
  // computes the real discount at checkout, this just avoids a round trip
  // to show the shape of the total before submitting.
  const discountsEnabled = (featureSettings.data?.discountCodesEnabled ?? true) && (config.data?.showDiscountAtCheckout ?? true);
  const matchedDiscount = discountsEnabled ? discountCodes.data?.find((d) => d.active && d.code === discountCode.trim().toUpperCase()) : undefined;
  const discountAmount = matchedDiscount
    ? matchedDiscount.discount_type === 'percent'
      ? beforeTip * (Number(matchedDiscount.value) / 100)
      : Math.min(Number(matchedDiscount.value), beforeTip)
    : 0;
  const total = beforeTip - discountAmount + tip;

  const checkout = useMutation({
    mutationFn: async () => {
      const servicesTaxable = taxConfig.data?.services_taxable ?? false;
      const lineItems = [
        { name: service?.name ?? 'Service', itemType: 'service' as const, price: servicePrice, taxable: servicesTaxable },
        ...extraServices.map((s) => ({ name: s.name, itemType: 'service' as const, price: Number(s.price), taxable: servicesTaxable })),
        ...retailItems.map((p) => ({ productId: p.id, name: p.name, itemType: 'retail' as const, price: Number(p.price), taxable: true })),
        ...(barberPremium > 0 ? [{ name: 'Requested barber premium', itemType: 'service' as const, price: barberPremium, taxable: servicesTaxable }] : []),
      ];
      let paymentToken: string | undefined;
      if (paymentMethod === 'card') {
        if (!cardTokenizer.current) throw new Error('Enter valid card details before completing the sale.');
        paymentToken = await cardTokenizer.current();
      }
      return api.post('/payments/checkout', {
        idempotencyKey,
        queueEntryId: entry.id,
        serviceId: primaryServiceId,
        lineItems,
        tip,
        paymentMethod,
        paymentToken,
        externalReference: paymentMethod === 'external' ? (config.data?.mode === 'manual' ? `manual-${idempotencyKey}` : externalReference) : undefined,
        discountCode: discountsEnabled ? discountCode.trim() || undefined : undefined,
      });
    },
    onMutate: () => setProcessing(true),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => {
      setProcessing(false);
      setError(err instanceof ApiError ? (err.body?.message ?? 'Checkout failed') : err instanceof Error ? err.message : 'Checkout failed');
    },
  });

  const busy = checkout.isPending || processing;

  return (
    <CheckoutShell busy={busy} onClose={onClose}>
      <div className="mb-5">
        <h3 className="text-lg font-semibold">Complete service</h3>
        <p className="mt-0.5 text-sm text-gray-500">{displayName(entry)} · Confirm services and products, add a tip, then choose payment.</p>
      </div>

      {/* Two-column on wide screens so the whole flow fits without scrolling:
          services/products on the left, adjustments + payment on the right. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="rounded-xl border border-black/10 p-4">
        <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold">1. Services & products</h4><span className="text-xs text-gray-400">Edit if the visit changed</span></div>
        <label className="mb-3 block text-xs font-medium text-gray-500">Primary service<select className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black" value={primaryServiceId} disabled={busy} onChange={(event) => setPrimaryServiceId(event.target.value)}>{services.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.duration_minutes} min · ${item.price}</option>)}</select></label>

      <div className="mb-3 space-y-1 rounded-lg bg-stone-50 p-3">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{service?.name}</span>
          <span>${servicePrice.toFixed(2)}</span>
        </div>
        {extraServices.map((s, i) => (
          <div key={`svc-${s.id}-${i}`} className="flex justify-between text-sm text-gray-600">
            <span>+ {s.name}</span>
            <span className="flex items-center gap-2">
              ${Number(s.price).toFixed(2)}
              <button
                type="button"
                aria-label={`Remove ${s.name}`}
                className="text-gray-400 hover:text-red-600"
                disabled={busy}
                onClick={() => setExtraServices((items) => items.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        {retailItems.map((p, i) => (
          <div key={`ret-${p.id}-${i}`} className="flex justify-between text-sm text-gray-600">
            <span>+ {p.name}</span>
            <span className="flex items-center gap-2">
              ${Number(p.price).toFixed(2)}
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                className="text-gray-400 hover:text-red-600"
                disabled={busy}
                onClick={() => setRetailItems((items) => items.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        {barberPremium > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>+ Requested barber premium</span>
            <span>${barberPremium.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {services.data && services.data.length > 0 && (
          <select
            aria-label="Add another service"
            className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm text-gray-500"
            disabled={busy}
            value=""
            onChange={(e) => {
              const svc = services.data!.find((s) => s.id === e.target.value);
              if (svc) setExtraServices((items) => [...items, svc]);
            }}
          >
            <option value="">+ Add a service…</option>
            {services.data.filter((s) => s.id !== primaryServiceId && !extraServices.some((selected) => selected.id === s.id)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · ${Number(s.price).toFixed(2)}
              </option>
            ))}
          </select>
        )}
        {(featureSettings.data?.retailProductsEnabled ?? true) && products.data && products.data.length > 0 && (
          <select
            aria-label="Add a product"
            className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm text-gray-500"
            disabled={busy}
            value=""
            onChange={(e) => {
              const product = products.data!.find((p) => p.id === e.target.value);
              if (product) setRetailItems((items) => [...items, product]);
            }}
          >
            <option value="">+ Add a product…</option>
            {products.data.map((p) => (
              <option key={p.id} value={p.id} disabled={p.stock_qty <= 0}>
                {p.name} · ${Number(p.price).toFixed(2)} · {p.stock_qty > 0 ? `${p.stock_qty} in stock` : 'out of stock'}
              </option>
            ))}
          </select>
        )}
      </div>
      </section>

      <div className="space-y-4">
      <section className="rounded-xl border border-black/10 p-4">
        <h4 className="mb-3 text-sm font-semibold">2. Adjustments</h4>
        <div className={`grid gap-3 ${discountsEnabled ? 'sm:grid-cols-2' : ''}`}>
          <div>
            <label htmlFor="checkout-tip" className="mb-1 block text-xs font-medium text-gray-500">Tip</label>
            <div className="flex items-center rounded-lg border border-black/15 bg-white px-3 focus-within:ring-2 focus-within:ring-black/10"><span className="text-gray-400">$</span><input id="checkout-tip" type="number" min="0" step="0.01" className="w-full px-2 py-2 outline-none disabled:bg-gray-50" value={tip || ''} placeholder="0.00" disabled={busy} onChange={(e) => setTip(Math.max(0, Number(e.target.value)))} /></div>
            <div className="mt-2 flex gap-1.5">{[0, 5, 10, 15].map((amount) => <button key={amount} type="button" disabled={busy} onClick={() => setTip(amount)} className={`rounded-md px-2.5 py-1 text-xs ${tip === amount ? 'bg-black text-white' : 'bg-stone-100 text-gray-600 hover:bg-stone-200'}`}>{amount === 0 ? 'No tip' : `$${amount}`}</button>)}</div>
          </div>
          {discountsEnabled && <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Discount code <span className="font-normal text-gray-400">(optional)</span></label>
      {!discountOpen ? (
          <button
            className="w-full rounded-lg border border-dashed border-black/20 px-3 py-2 text-left text-sm text-gray-500 hover:border-black/40 hover:text-black"
            disabled={busy}
            onClick={() => setDiscountOpen(true)}
          >
            Add a discount code
          </button>
        ) : (
          <div>
            <input
              autoFocus
              className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono uppercase disabled:bg-gray-50"
              placeholder="Discount code"
              value={discountCode}
              disabled={busy}
              onChange={(e) => setDiscountCode(e.target.value)}
            />
            {discountCode.trim() && (
              <p className={`mt-1 text-xs ${matchedDiscount ? 'text-green-700' : 'text-gray-400'}`}>
                {matchedDiscount ? `−$${discountAmount.toFixed(2)} applied` : 'Not a recognized active code — validated again at checkout'}
              </p>
            )}
          </div>
        )}
          </div>}
        </div>
      </section>

      <section className="rounded-xl border border-black/10 p-4">
        <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold">3. Payment</h4><div className="text-right"><div className="text-xs text-gray-400">Total due</div><div className="text-xl font-bold">${total.toFixed(2)}</div></div></div>
        <div className={`mb-3 grid gap-3 rounded-lg bg-stone-50 p-3 text-sm ${discountsEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}><div><div className="text-xs text-gray-400">Items</div><strong>${beforeTip.toFixed(2)}</strong></div>{discountsEnabled && <div><div className="text-xs text-gray-400">Discount</div><strong>{discountAmount > 0 ? `−$${discountAmount.toFixed(2)}` : '—'}</strong></div>}<div><div className="text-xs text-gray-400">Tip</div><strong>${tip.toFixed(2)}</strong></div></div>
      {/* Two large full-width buttons, solid-fill on the active one — must
          be unmistakable at a glance (confirmed decision). External/manual
          stays available but demoted to a small link below, not a third
          equal-weight button. */}
      <div className="flex gap-2 mb-2">
        <button
          disabled={busy}
          onClick={() => setPaymentMethod('cash')}
          className={`flex-1 rounded-lg py-4 text-base font-semibold transition disabled:opacity-50 ${
            paymentMethod === 'cash' ? 'bg-black text-white' : 'border border-black/15 bg-white hover:border-black/40'
          }`}
        >
          Cash
        </button>
        <button
          disabled={busy || (config.data?.mode === 'integrated' && !config.data?.configured)}
          onClick={() => setPaymentMethod(config.data?.mode === 'manual' ? 'external' : 'card')}
          className={`flex-1 rounded-lg py-4 text-base font-semibold transition disabled:opacity-50 ${
            (config.data?.mode === 'manual' ? paymentMethod === 'external' : paymentMethod === 'card') ? 'bg-black text-white' : 'border border-black/15 bg-white hover:border-black/40'
          }`}
        >
          {config.data?.mode === 'manual' ? 'Manual card' : `Card ${config.data && !config.data.configured ? '(not configured)' : ''}`}
        </button>
      </div>

      {paymentMethod === 'card' && config.data?.mode === 'integrated' && <CardPaymentFields config={config.data} tokenizerRef={cardTokenizer} onReady={setCardReady} />}

      {config.data?.mode === 'manual' && <p className="mb-3 text-xs text-gray-500">Record the amount and tip here after taking payment outside SmoothSoft.</p>}

      {config.data?.mode !== 'manual' && (!showExternal ? (
        <button className="text-xs text-gray-400 underline hover:text-black mb-3" disabled={busy} onClick={() => setShowExternal(true)}>
          Use another terminal instead
        </button>
      ) : (
        <div className="mb-3">
          <button
            onClick={() => setPaymentMethod('external')}
            disabled={busy}
            className={`w-full rounded-lg py-2 text-sm font-medium mb-2 transition disabled:opacity-50 ${
              paymentMethod === 'external' ? 'bg-black text-white' : 'border border-black/15 bg-white hover:border-black/40'
            }`}
          >
            Other terminal
          </button>
          {paymentMethod === 'external' && (
            <input
              className="w-full border border-black/15 rounded-lg px-3 py-2 disabled:bg-gray-50"
              placeholder="Reference/confirmation number"
              value={externalReference}
              disabled={busy}
              onChange={(e) => setExternalReference(e.target.value)}
            />
          )}
        </div>
      ))}
      </section>
      </div>
      </div>

      {processing && paymentMethod === 'card' && <p className="mt-4 text-sm text-gray-500">Processing payment…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Sticky, not just in-flow: this panel can be taller than the viewport
          (see CheckoutShell's maxHeight clamp), and the primary action must
          stay reachable without scrolling all the way to the bottom of a
          long services/payment form. */}
      <div className="sticky -bottom-5 -mx-5 -mb-5 flex justify-end gap-2 border-t border-black/10 bg-[#fffefa] px-5 py-3">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="solid" onClick={() => checkout.mutate()} disabled={busy || (paymentMethod === 'card' && !cardReady)}>
          {processing && paymentMethod === 'card' ? 'Processing…' : 'Complete & record sale'}
        </Button>
      </div>
    </CheckoutShell>
  );
}

interface CloseShopSummary {
  tasks: string[];
  startingFloat: number;
  cashSalesTotal: number;
  expectedCash: number;
  cardSalesTotal: number;
  cardFeePct: number;
  estimatedCardFee: number;
}

interface OpenShopSummary { tasks: string[]; defaultStartingFloat: number }

function OpenShopPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [actualStartingFloat, setActualStartingFloat] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const summary = useQuery({ queryKey: ['payments', 'open-shop-summary'], queryFn: () => api.get<OpenShopSummary>('/payments/open-shop-summary') });
  useEffect(() => { if (summary.data && actualStartingFloat === '') setActualStartingFloat(summary.data.defaultStartingFloat); }, [summary.data, actualStartingFloat]);
  const complete = useMutation({ mutationFn: () => api.post('/payments/open-shop', { tasksCompleted: Array.from(checkedTasks), actualStartingFloat: typeof actualStartingFloat === 'number' ? actualStartingFloat : 0 }), onSuccess: () => { onDone(); onClose(); }, onError: (err) => setError(err instanceof ApiError ? (err.body?.message ?? 'Could not open store') : 'Could not open store') });
  if (!summary.data) return null;
  const canComplete = summary.data.tasks.every((task) => checkedTasks.has(task)) && typeof actualStartingFloat === 'number';
  const variance = typeof actualStartingFloat === 'number' ? actualStartingFloat - summary.data.defaultStartingFloat : 0;
  return <Modal onClose={onClose}><h3 className="mb-1 font-semibold">Open store</h3><p className="mb-4 text-sm text-gray-500">Complete each opening task, then confirm the cash actually in the drawer.</p><div className="mb-4 space-y-2">{summary.data.tasks.map((task) => <label key={task} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={checkedTasks.has(task)} onChange={() => setCheckedTasks((previous) => { const next = new Set(previous); if (next.has(task)) next.delete(task); else next.add(task); return next; })} /><span className={checkedTasks.has(task) ? 'text-gray-400 line-through' : ''}>{task}</span></label>)}</div><div className="mb-4 border-t border-black/10 pt-3"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Opening cash drawer</h4><label className="text-xs font-medium text-gray-500">Actual cash in drawer<input aria-label="Actual opening cash in drawer" type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black" value={actualStartingFloat} onChange={(event) => setActualStartingFloat(event.target.value === '' ? '' : Number(event.target.value))} /></label><p className="mt-2 text-xs text-gray-500">Your default is ${summary.data.defaultStartingFloat.toFixed(2)}. Change it to match the cash you count.</p>{variance !== 0 && <p className={`mt-1 text-sm font-medium ${variance > 0 ? 'text-green-700' : 'text-amber-700'}`}>{variance > 0 ? `$${variance.toFixed(2)} above default` : `$${Math.abs(variance).toFixed(2)} below default`}</p>}</div>{error && <p className="mb-3 text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="solid" disabled={!canComplete || complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? 'Recording…' : 'Complete opening'}</Button></div></Modal>;
}

function CloseShopPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [actualCashCount, setActualCashCount] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ['payments', 'close-shop-summary'], queryFn: () => api.get<CloseShopSummary>('/payments/close-shop-summary') });

  const variance = typeof actualCashCount === 'number' && summary.data ? actualCashCount - summary.data.expectedCash : null;
  const matches = variance !== null && Math.abs(variance) < 0.01;

  const complete = useMutation({
    mutationFn: () =>
      api.post('/payments/close-shop', {
        tasksCompleted: Array.from(checkedTasks),
        actualCashCount: typeof actualCashCount === 'number' ? actualCashCount : 0,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? (err.body?.message ?? 'Could not close shop') : 'Could not close shop'),
  });

  if (!summary.data) return null;

  const allTasksChecked = summary.data.tasks.every((t) => checkedTasks.has(t));
  const canComplete = allTasksChecked && typeof actualCashCount === 'number';

  function toggleTask(task: string) {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(task)) next.delete(task);
      else next.add(task);
      return next;
    });
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-4">Close up shop</h3>

      <div className="space-y-2 mb-4">
        {summary.data.tasks.map((task) => (
          <label key={task} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={checkedTasks.has(task)} onChange={() => toggleTask(task)} />
            <span className={checkedTasks.has(task) ? 'line-through text-gray-400' : ''}>{task}</span>
          </label>
        ))}
      </div>

      <div className="border-t border-black/10 pt-3 mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Cash drawer</h4>
        <div className="text-sm text-gray-600 space-y-1 mb-2">
          <div className="flex justify-between">
            <span>Starting float</span>
            <span>${summary.data.startingFloat.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cash sales today</span>
            <span>${summary.data.cashSalesTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-medium text-black">
            <span>Expected in drawer</span>
            <span>${summary.data.expectedCash.toFixed(2)}</span>
          </div>
        </div>
        <input
          type="number"
          className="w-full border border-black/15 rounded-lg px-3 py-2 mb-2"
          placeholder="Actual counted amount"
          value={actualCashCount}
          onChange={(e) => setActualCashCount(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {variance !== null && (
          <p className={`text-sm font-medium ${matches ? 'text-green-700' : 'text-red-600'}`}>
            {matches ? 'Matches exactly' : variance > 0 ? `$${variance.toFixed(2)} over` : `$${Math.abs(variance).toFixed(2)} short`}
          </p>
        )}
      </div>

      <div className="border-t border-black/10 pt-3 mb-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Card sales</h4>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Total card sales</span>
          <span>${summary.data.cardSalesTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Estimated processing fee ({summary.data.cardFeePct}%)</span>
          <span>-${summary.data.estimatedCardFee.toFixed(2)}</span>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => complete.mutate()} disabled={!canComplete || complete.isPending}>
          Complete closing
        </Button>
      </div>
    </Modal>
  );
}
