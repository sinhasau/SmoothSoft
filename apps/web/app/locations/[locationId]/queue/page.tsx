'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { useLiveQueueSync } from '../../../../lib/socket';
import { Button, Card, ClockInDropdown, RowMenu, StatusDropdown } from '../../../../components/ui';

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
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  requestedSpecificStaff: boolean;
  present: boolean;
  presentCheckedAt: string | null;
  isAppt: boolean;
  apptAt: string | null;
  waitingOrder: number | null;
  estimatedStart: string | null;
  updatedAt: string;
}

interface Board {
  team: TeamMember[];
  nowServing: QueueEntry[];
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

export default function QueuePage({ params }: { params: { locationId: string } }) {
  useLiveQueueSync();
  const queryClient = useQueryClient();
  const [showCheckIn, setShowCheckIn] = useState<'walkin' | 'appointment' | null>(null);
  const [checkoutEntry, setCheckoutEntry] = useState<QueueEntry | null>(null);
  const [startEntry, setStartEntry] = useState<QueueEntry | null>(null);
  const [reassignEntry, setReassignEntry] = useState<QueueEntry | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [localWaitingOrder, setLocalWaitingOrder] = useState<string[] | null>(null);
  const [showCloseShop, setShowCloseShop] = useState(false);
  const [confirmingUndo, setConfirmingUndo] = useState<string | null>(null);

  const board = useQuery({ queryKey: ['queue', 'board'], queryFn: () => api.get<Board>('/queue/board'), refetchInterval: 20_000 });
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const activity = useQuery({ queryKey: ['queue', 'activity'], queryFn: () => api.get<ActivityEvent[]>('/queue/activity?limit=15') });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['queue', 'board'] });
    void queryClient.invalidateQueries({ queryKey: ['queue', 'activity'] });
  }

  const clockIn = useMutation({ mutationFn: (staffId: string) => api.post(`/staff/${staffId}/clock-in`), onSuccess: invalidate });

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
    mutationFn: ({ id, present }: { id: string; present: boolean }) => api.post(`/queue/${id}/present`, { present }),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (orderedQueueEntryIds: string[]) => api.post('/queue/reorder', { orderedQueueEntryIds }),
    onSuccess: invalidate,
    onSettled: () => setLocalWaitingOrder(null),
  });

  const onShiftTeam = board.data?.team.filter((t) => t.status !== 'off') ?? [];
  const offShiftTeam = board.data?.team.filter((t) => t.status === 'off') ?? [];
  const availableStaff = board.data?.team.filter((t) => t.status === 'available') ?? [];

  const waitingList = localWaitingOrder
    ? localWaitingOrder.map((id) => board.data!.waiting.find((w) => w.id === id)!).filter(Boolean)
    : (board.data?.waiting ?? []);

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
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Live queue</h2>
          <p className="text-sm text-gray-500">Shared device · all barbers</p>
        </div>
        <Button variant="solid" onClick={() => setShowCloseShop(true)}>
          Close up shop
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2">
        {onShiftTeam.map((t) => (
          <div key={t.locationStaffId} className="flex items-center gap-2 pr-4 border-r border-black/10 last:border-0">
            <span
              className={`w-2 h-2 rounded-full ${
                t.status === 'available' ? 'bg-green-500' : t.status === 'busy' ? 'bg-blue-500' : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-sm">{t.fullName}</span>
            <StatusDropdown status={t.status} onChange={(status) => setStatus.mutate({ staffId: t.locationStaffId, status })} />
          </div>
        ))}
        <div className="ml-auto">
          <ClockInDropdown offStaff={offShiftTeam} onClockIn={(id) => clockIn.mutate(id)} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Now serving</h2>
        <Card>
          {board.data?.nowServing.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No one in a chair right now.</div>}
          {board.data?.nowServing.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3">
              <div>
                <div className="font-medium">{displayName(e)}</div>
                <div className="text-sm text-gray-500">
                  {e.serviceName} with {e.assignedStaffName} · started {timeLabel(e.updatedAt)}
                </div>
              </div>
              {/* gap-3 matches the waiting rows so Complete's right edge lines up with Start's. */}
              <div className="flex items-center gap-3">
                <Button variant="solid" onClick={() => setCheckoutEntry(e)}>
                  Complete
                </Button>
                <RowMenu
                  items={[
                    { label: 'Return to top of waiting', onClick: () => returnToWaiting.mutate({ id: e.id, position: 'top' }) },
                    { label: 'Return to original position', onClick: () => returnToWaiting.mutate({ id: e.id, position: 'original' }) },
                    { label: 'Cancel service', onClick: () => cancel.mutate(e.id), destructive: true },
                  ]}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Waiting · drag to reorder</h2>
          {/* mr-[60px] = card px-4 (16) + ⋮ menu w-8 (32) + gap-3 (12), so these
              buttons' right edge aligns exactly with the Start buttons below. */}
          <div className="flex gap-2 mr-[60px]">
            <Button onClick={() => setShowCheckIn('appointment')}>+ Appointment</Button>
            <Button variant="solid" onClick={() => setShowCheckIn('walkin')}>
              + Walk-in
            </Button>
          </div>
        </div>
        <Card>
          {waitingList.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No one waiting.</div>}
          {waitingList.map((e, i) => (
            <div
              key={e.id}
              draggable
              onDragStart={() => setDragId(e.id)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => handleDrop(e.id)}
              className={`flex items-center justify-between gap-4 border-b border-black/5 last:border-0 px-4 py-3 ${dragId === e.id ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="cursor-grab text-gray-300 select-none" title="Drag to reorder">
                  ⠿
                </span>
                <span className="w-6 h-6 rounded-full bg-gray-100 text-xs flex items-center justify-center">{i + 1}</span>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {displayName(e)}
                    {e.isAppt && <span className="text-xs text-gray-400 border border-black/10 rounded px-1.5 py-0.5">appt</span>}
                  </div>
                  <div className="text-sm text-gray-500">
                    {e.serviceName} · {e.assignedStaffName ?? 'Any available'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex flex-col items-center text-xs text-gray-500">
                  <input type="checkbox" checked={e.present} onChange={(ev) => togglePresent.mutate({ id: e.id, present: ev.target.checked })} />
                  here
                  {e.present && e.presentCheckedAt && <span className="text-[10px] text-gray-400">{timeLabel(e.presentCheckedAt)}</span>}
                </label>
                <span className="text-sm text-gray-500 min-w-[76px] text-right whitespace-nowrap">
                  {e.isAppt ? timeLabel(e.apptAt) : `~${timeLabel(e.estimatedStart)}`}
                </span>
                <Button disabled={availableStaff.length === 0} onClick={() => setStartEntry(e)}>
                  Start
                </Button>
                <RowMenu
                  items={[
                    { label: 'Reassign', onClick: () => setReassignEntry(e) },
                    { label: 'Mark no-show', onClick: () => noShow.mutate(e.id), hidden: e.present },
                    { label: 'Mark abandoned', onClick: () => abandon.mutate(e.id), hidden: !e.present },
                    { label: 'Cancel', onClick: () => cancel.mutate(e.id), destructive: true },
                  ]}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Activity</h2>
        {/* Exactly 4 rows visible: each row is a fixed h-9 (36px) + 3 dividers
            = 147px; anything past that scrolls (item 31). */}
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
      </div>

      {showCheckIn && services.data && (
        <CheckInPanel
          isAppointment={showCheckIn === 'appointment'}
          services={services.data}
          team={board.data?.team ?? []}
          onClose={() => setShowCheckIn(null)}
          onDone={invalidate}
        />
      )}

      {startEntry && <StartPanel entry={startEntry} availableStaff={availableStaff} onClose={() => setStartEntry(null)} onDone={invalidate} />}

      {reassignEntry && (
        <ReassignPanel entry={reassignEntry} team={board.data?.team ?? []} onClose={() => setReassignEntry(null)} onDone={invalidate} />
      )}

      {checkoutEntry && (
        <CheckoutPanel entry={checkoutEntry} locationId={params.locationId} onClose={() => setCheckoutEntry(null)} onDone={invalidate} />
      )}

      {showCloseShop && <CloseShopPanel onClose={() => setShowCloseShop(false)} onDone={invalidate} />}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
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
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
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
        serviceId,
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
          className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3"
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
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

      <select className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.duration_minutes}min · ${s.price}
          </option>
        ))}
      </select>

      <select className="w-full border border-black/15 rounded-lg px-3 py-2 mb-4" value={requestedStaffId} onChange={(e) => setRequestedStaffId(e.target.value)}>
        <option value="">Any available</option>
        {team.map((t) => (
          <option key={t.locationStaffId} value={t.locationStaffId}>
            {t.fullName}
          </option>
        ))}
      </select>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
          {isAppointment ? 'Book' : 'Check in'}
        </Button>
      </div>
    </Modal>
  );
}

function StartPanel({
  entry,
  availableStaff,
  onClose,
  onDone,
}: {
  entry: QueueEntry;
  availableStaff: TeamMember[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [staffId, setStaffId] = useState(entry.assignedStaffId ?? availableStaff[0]?.locationStaffId ?? '');
  const [serviceNotes, setServiceNotes] = useState('');

  const start = useMutation({
    mutationFn: () => api.post(`/queue/${entry.id}/start`, { staffId, serviceNotes }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-1">Start — {displayName(entry)}</h3>
      <p className="text-sm text-gray-500 mb-4">{entry.serviceName}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {availableStaff.map((t) => (
          <button
            key={t.locationStaffId}
            type="button"
            onClick={() => setStaffId(t.locationStaffId)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              staffId === t.locationStaffId ? 'border-black bg-black text-white' : 'border-black/15 bg-white text-ink hover:border-black/40'
            }`}
          >
            {t.fullName}
          </button>
        ))}
      </div>
      <textarea
        className="w-full border border-black/15 rounded-lg px-3 py-2 mb-4"
        placeholder="Service notes"
        value={serviceNotes}
        onChange={(e) => setServiceNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => start.mutate()} disabled={!staffId || start.isPending}>
          Start
        </Button>
      </div>
    </Modal>
  );
}

function ReassignPanel({
  entry,
  team,
  onClose,
  onDone,
}: {
  entry: QueueEntry;
  team: TeamMember[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [staffId, setStaffId] = useState(entry.assignedStaffId ?? '');

  const reassign = useMutation({
    mutationFn: () => api.post(`/queue/${entry.id}/reassign`, { newStaffId: staffId }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-1">Reassign — {displayName(entry)}</h3>
      <p className="text-sm text-gray-500 mb-4">Currently: {entry.assignedStaffName ?? 'Any available'}</p>
      <select className="w-full border border-black/15 rounded-lg px-3 py-2 mb-4" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
        <option value="">Any available</option>
        {team.map((t) => (
          <option key={t.locationStaffId} value={t.locationStaffId}>
            {t.fullName}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => reassign.mutate()} disabled={!staffId || reassign.isPending}>
          Reassign
        </Button>
      </div>
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
  const [extraServices, setExtraServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const config = useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => api.get<{ activeProcessor: string; configured: boolean; showDiscountAtCheckout: boolean }>('/payments/config'),
  });
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const products = useQuery({ queryKey: ['settings', 'products'], queryFn: () => api.get<Product[]>('/settings/products') });
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
  const service = services.data?.find((s) => s.id === entry.serviceId);
  const servicePrice = service ? Number(service.price) : 0;
  const extraServicesTotal = extraServices.reduce((sum, s) => sum + Number(s.price), 0);
  const retailTotal = retailItems.reduce((sum, p) => sum + Number(p.price), 0);

  // Requesting a barber by name (as opposed to "any available") can carry a
  // premium, per the location's owner-configured pricing policy.
  const assignedStaffTier = roster.data?.find((r) => r.locationStaffId === entry.assignedStaffId);
  const barberPremium =
    entry.requestedSpecificStaff && pricingPolicy.data
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
  const matchedDiscount = discountCodes.data?.find((d) => d.active && d.code === discountCode.trim().toUpperCase());
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
        ...retailItems.map((p) => ({ name: p.name, itemType: 'retail' as const, price: Number(p.price), taxable: true })),
        ...(barberPremium > 0 ? [{ name: 'Requested barber premium', itemType: 'service' as const, price: barberPremium, taxable: servicesTaxable }] : []),
      ];
      // Simulates the future Stripe API response gate (item 4) — cash and
      // the external/manual path complete instantly, since there's no
      // processor round trip for either of those.
      if (paymentMethod === 'card') {
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      return api.post('/payments/checkout', {
        queueEntryId: entry.id,
        lineItems,
        tip,
        paymentMethod,
        externalReference: paymentMethod === 'external' ? externalReference : undefined,
        discountCode: discountCode.trim() || undefined,
      });
    },
    onMutate: () => setProcessing(true),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => {
      setProcessing(false);
      setError(err instanceof ApiError ? (err.body?.message ?? 'Checkout failed') : 'Checkout failed');
    },
  });

  const busy = checkout.isPending || processing;

  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <h3 className="font-semibold mb-1">Complete — {displayName(entry)}</h3>
      <p className="text-sm text-gray-500 mb-4">{service?.name}</p>

      <div className="mb-2 space-y-1">
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

      <div className="mb-2 flex gap-2">
        {services.data && services.data.length > 0 && (
          <select
            className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm text-gray-500"
            disabled={busy}
            value=""
            onChange={(e) => {
              const svc = services.data!.find((s) => s.id === e.target.value);
              if (svc) setExtraServices((items) => [...items, svc]);
            }}
          >
            <option value="">+ Add a service…</option>
            {services.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · ${Number(s.price).toFixed(2)}
              </option>
            ))}
          </select>
        )}
        {products.data && products.data.length > 0 && (
          <select
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
              <option key={p.id} value={p.id}>
                {p.name} · ${Number(p.price).toFixed(2)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex justify-between text-sm font-medium mb-3 pt-2 border-t border-black/5">
        <span>Total (before tip)</span>
        <span>${beforeTip.toFixed(2)}</span>
      </div>

      {/* Discount entry hides behind a small affordance; whether it appears
          at all is an owner setting (Settings → Billing, default on). */}
      {(config.data?.showDiscountAtCheckout ?? true) &&
        (!discountOpen ? (
          <button
            className="mb-3 rounded-lg border border-dashed border-black/20 px-3 py-1.5 text-xs text-gray-500 hover:border-black/40 hover:text-black"
            disabled={busy}
            onClick={() => setDiscountOpen(true)}
          >
            + Discount code
          </button>
        ) : (
          <div className="mb-2">
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
        ))}
      <input
        type="number"
        className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3 disabled:bg-gray-50"
        placeholder="Tip"
        value={tip}
        disabled={busy}
        onChange={(e) => setTip(Number(e.target.value))}
      />
      <div className="flex justify-between font-semibold mb-4">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>

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
          disabled={busy || !config.data?.configured}
          onClick={() => setPaymentMethod('card')}
          className={`flex-1 rounded-lg py-4 text-base font-semibold transition disabled:opacity-50 ${
            paymentMethod === 'card' ? 'bg-black text-white' : 'border border-black/15 bg-white hover:border-black/40'
          }`}
        >
          Card {config.data && !config.data.configured ? '(not configured)' : ''}
        </button>
      </div>

      {!showExternal ? (
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
      )}

      {processing && paymentMethod === 'card' && <p className="text-sm text-gray-500 mb-3">Processing payment…</p>}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="solid" onClick={() => checkout.mutate()} disabled={busy}>
          {processing && paymentMethod === 'card' ? 'Processing…' : 'Complete & record sale'}
        </Button>
      </div>
    </Modal>
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
