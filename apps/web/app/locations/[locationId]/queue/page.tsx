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
  present: boolean;
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

interface ActivityEvent {
  id: string;
  event_type: string;
  entity_id: string | null;
  created_at: string;
}

function displayName(e: { clientName: string | null; guestName: string | null }) {
  return e.clientName ?? e.guestName ?? 'Guest';
}

function timeLabel(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
              <div className="flex items-center gap-1">
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
          <div className="flex gap-2">
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
                </label>
                <span className="text-sm text-gray-500 w-16 text-right">{e.isAppt ? timeLabel(e.apptAt) : `~${timeLabel(e.estimatedStart)}`}</span>
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
        <Card>
          {activity.data?.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-2 text-sm">
              <span>{ev.event_type.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-3 text-gray-400">
                <span>{new Date(ev.created_at).toLocaleDateString()}</span>
                {!ev.event_type.endsWith('_undone') && (
                  <button className="underline hover:text-black" onClick={() => undo.mutate(String(ev.id))}>
                    Undo
                  </button>
                )}
              </div>
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
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-20 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl border border-black/10 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
      <select className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
        {availableStaff.map((t) => (
          <option key={t.locationStaffId} value={t.locationStaffId}>
            {t.fullName}
          </option>
        ))}
      </select>
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
  const [externalReference, setExternalReference] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const config = useQuery({ queryKey: ['payments', 'config'], queryFn: () => api.get<{ activeProcessor: string; configured: boolean }>('/payments/config') });

  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const discountCodes = useQuery({
    queryKey: ['settings', 'discount-codes'],
    queryFn: () => api.get<{ code: string; discount_type: 'percent' | 'flat'; value: string; active: boolean }[]>('/settings/discount-codes'),
  });
  const service = services.data?.find((s) => s.id === entry.serviceId);
  const price = service ? Number(service.price) : 0;

  // Client-side preview only — the server independently validates and
  // computes the real discount at checkout, this just avoids a round trip
  // to show the shape of the total before submitting.
  const matchedDiscount = discountCodes.data?.find((d) => d.active && d.code === discountCode.trim().toUpperCase());
  const discountAmount = matchedDiscount
    ? matchedDiscount.discount_type === 'percent'
      ? price * (Number(matchedDiscount.value) / 100)
      : Math.min(Number(matchedDiscount.value), price)
    : 0;
  const total = price - discountAmount + tip;

  const checkout = useMutation({
    mutationFn: () =>
      api.post('/payments/checkout', {
        queueEntryId: entry.id,
        lineItems: [{ name: service?.name ?? 'Service', itemType: 'service', price, taxable: false }],
        tip,
        paymentMethod,
        externalReference: paymentMethod === 'external' ? externalReference : undefined,
        discountCode: discountCode.trim() || undefined,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.body?.message ?? 'Checkout failed' : 'Checkout failed');
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-1">Complete — {displayName(entry)}</h3>
      <p className="text-sm text-gray-500 mb-4">{service?.name}</p>

      <div className="flex justify-between text-sm mb-1">
        <span>Total before tip</span>
        <span>${price.toFixed(2)}</span>
      </div>
      <input
        className="w-full border border-black/15 rounded-lg px-3 py-2 mb-1 font-mono uppercase"
        placeholder="Discount code (optional)"
        value={discountCode}
        onChange={(e) => setDiscountCode(e.target.value)}
      />
      {discountCode.trim() && (
        <p className={`text-xs mb-2 ${matchedDiscount ? 'text-green-700' : 'text-gray-400'}`}>
          {matchedDiscount ? `−$${discountAmount.toFixed(2)} applied` : 'Not a recognized active code — validated again at checkout'}
        </p>
      )}
      <input
        type="number"
        className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3"
        placeholder="Tip"
        value={tip}
        onChange={(e) => setTip(Number(e.target.value))}
      />
      <div className="flex justify-between font-semibold mb-4">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>

      <div className="flex gap-2 mb-3">
        <Button variant={paymentMethod === 'cash' ? 'solid' : 'default'} onClick={() => setPaymentMethod('cash')}>
          Cash
        </Button>
        <Button
          variant={paymentMethod === 'card' ? 'solid' : 'default'}
          onClick={() => setPaymentMethod('card')}
          disabled={!config.data?.configured}
        >
          Card {config.data && !config.data.configured ? '(not configured)' : ''}
        </Button>
        <Button variant={paymentMethod === 'external' ? 'solid' : 'default'} onClick={() => setPaymentMethod('external')}>
          Other terminal
        </Button>
      </div>

      {paymentMethod === 'external' && (
        <input
          className="w-full border border-black/15 rounded-lg px-3 py-2 mb-3"
          placeholder="Reference/confirmation number"
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value)}
        />
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
          Complete &amp; record sale
        </Button>
      </div>
    </Modal>
  );
}
