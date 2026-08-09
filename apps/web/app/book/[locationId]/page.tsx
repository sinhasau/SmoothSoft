'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, ApiError } from '../../../lib/api';
import { formatPhoneInput } from '../../../lib/phone';
import { ServiceMultiPicker } from '../../../components/service-multi-picker';

type Catalog = { location: { name: string }; services: { id: string; name: string; durationMinutes: number; price: string }[]; staff: { id: string; fullName: string }[] };
type Slot = { startsAt: string; locationStaffId: string; staffName: string };
type Snapshot = { waitingCount: number; estimatedWaitMinutes: number; entries: { id: string; label: string; estimatedStart: string | null }[] };
type ProfileLookup = { isNewClient: boolean; people: { clientId: string; name: string; maskedPhone: string | null; suggestedServiceIds: string[] }[]; defaultServiceIds: string[]; inputWasPhone: boolean; digits: string };
type QueueStatus = { id: string; status: string; present: boolean; serviceName: string | null; staffName: string | null; position: number | null; aheadOfCount: number | null; estimatedStart: string | null };
type BookingConfirmation = { appointmentId: string; confirmationCode: string; startsAt: string; messageQueued: boolean };
type AppointmentStatus = { id: string; status: string; startsAt: string; confirmationCode: string | null; locationStaffId: string | null; staffName: string | null; serviceIds: string[]; serviceNames: string[] };

/** A person on the "who's coming in" list — either a profile already on file (clientId set) or a name just typed in, not yet a client record until they're actually joined/booked. Each carries their OWN service selection so a household can request different services on one phone number. */
type Person = { key: string; clientId?: string; name: string; maskedPhone?: string | null; selected: boolean; suggestedServiceIds: string[]; serviceIds: string[] };

async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

function minutesLabel(n: number) {
  if (n < 60) return `${n}`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}h${m ? ` ${m}m` : ''}`;
}

// Two request pages ('landing' → 'details'), then a live 'confirmed' status page.
type Step = 'landing' | 'details' | 'confirmed';
type Mode = 'queue' | 'appointment';

const emptyPeople: Person[] = [];

export default function PublicBookingPage({ params }: { params: { locationId: string } }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('landing');
  const [mode, setMode] = useState<Mode>('queue');
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [phone, setPhone] = useState('');            // number to reach the customer / create a new client
  const [lookupInput, setLookupInput] = useState(''); // name OR phone the customer types to find their profile
  const [people, setPeople] = useState<Person[]>(emptyPeople);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [defaultServiceIds, setDefaultServiceIds] = useState<string[]>([]);
  const [addingName, setAddingName] = useState('');
  const [addingOpen, setAddingOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [timePeriod, setTimePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  const [email, setEmail] = useState('');
  const [queueEntryIds, setQueueEntryIds] = useState<string[]>([]);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  // Two-tap confirm guard: holds the id of the entry (or 'appt') awaiting a
  // "yes, really cancel" tap, so a stray tap never drops someone's spot.
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  // Joined queue entries / a booked appointment live in the URL so reopening or
  // reloading this page keeps showing live status (and the cancel/reschedule
  // controls) without re-entering a phone number.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const fromQueue = search.get('queue');
    const fromAppt = search.get('appt');
    if (fromQueue) {
      setQueueEntryIds(fromQueue.split(',').filter(Boolean));
      setMode('queue');
      setStep('confirmed');
    } else if (fromAppt) {
      setAppointmentId(fromAppt);
      setMode('appointment');
      setStep('confirmed');
    }
  }, []);

  const catalog = useQuery({ queryKey: ['public-booking', params.locationId], queryFn: () => publicRequest<Catalog>(`/public/locations/${params.locationId}/booking`) });
  const snapshot = useQuery({
    queryKey: ['public-queue-snapshot', params.locationId],
    queryFn: () => publicRequest<Snapshot>(`/public/locations/${params.locationId}/queue/snapshot`),
    refetchInterval: 20_000,
    enabled: step === 'landing' || step === 'confirmed',
  });
  const queueStatuses = useQueries({
    queries: queueEntryIds.map((id) => ({
      queryKey: ['public-queue-status', params.locationId, id],
      queryFn: () => publicRequest<QueueStatus>(`/public/locations/${params.locationId}/queue/status/${id}`),
      enabled: step === 'confirmed' && mode === 'queue',
      refetchInterval: 20_000,
    })),
  });
  const apptStatus = useQuery({
    queryKey: ['public-appt-status', params.locationId, appointmentId],
    queryFn: () => publicRequest<AppointmentStatus>(`/public/locations/${params.locationId}/booking/${appointmentId}/status`),
    enabled: step === 'confirmed' && mode === 'appointment' && !!appointmentId,
    refetchInterval: 30_000,
  });

  const lookupProfile = useMutation({
    mutationFn: () => publicRequest<ProfileLookup>(`/public/locations/${params.locationId}/queue/lookup?q=${encodeURIComponent(lookupInput.trim())}`),
    onSuccess: (data) => {
      setDefaultServiceIds(data.defaultServiceIds);
      // A phone was typed → we have the number for a new client. A name was typed → we only have a
      // number once they pick an existing profile; if the name matched nothing, ask for a number.
      setPhone(data.inputWasPhone ? data.digits : '');

      if (data.isNewClient && !data.inputWasPhone) {
        // Name with no match — seed one new person from what they typed; they'll add a phone next.
        setPeople([{ key: 'new-self', name: lookupInput.trim(), selected: true, suggestedServiceIds: [], serviceIds: data.defaultServiceIds }]);
        setAddingOpen(false);
      } else {
        const found = data.people.map((person) => ({
          key: person.clientId,
          clientId: person.clientId,
          name: person.name,
          maskedPhone: person.maskedPhone,
          // Auto-select a lone match or a phone-based household; make same-name results an active pick.
          selected: data.inputWasPhone || data.people.length === 1,
          suggestedServiceIds: person.suggestedServiceIds,
          serviceIds: person.suggestedServiceIds.length ? person.suggestedServiceIds : data.defaultServiceIds,
        }));
        setPeople(found);
        setAddingOpen(found.length === 0);
      }
      setStep('details');
      setPendingMode(null);
    },
    onError: () => setPendingMode(null),
  });

  function enterFlow(target: Mode) {
    setMode(target);
    setPendingMode(target);
    lookupProfile.mutate();
  }

  function togglePerson(key: string) {
    setPeople((current) => current.map((person) => (person.key === key ? { ...person, selected: !person.selected } : person)));
  }
  function selectOnlyPerson(key: string) {
    setPeople((current) => current.map((person) => ({ ...person, selected: person.key === key })));
    setSlot(null);
  }
  function setPersonServices(key: string, ids: string[]) {
    setPeople((current) => current.map((person) => (person.key === key ? { ...person, serviceIds: ids } : person)));
    setSlot(null);
  }

  function confirmAddPerson() {
    const trimmed = addingName.trim();
    if (!trimmed) return;
    // Don't create a second identical name on this number — if someone with that exact name is
    // already on file for this phone, just select them instead of adding a duplicate row. The
    // server enforces the same rule (DUPLICATE_NAME_ON_PHONE) as a backstop.
    const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
    const existing = people.find((person) => person.name.replace(/\s+/g, ' ').toLowerCase() === normalized);
    if (existing) {
      setPeople((current) => current.map((person) => (person.key === existing.key ? { ...person, selected: true } : person)));
      setAddingName('');
      setAddingOpen(false);
      return;
    }
    setPeople((current) => [...current, { key: `new-${Date.now()}`, name: trimmed, selected: true, suggestedServiceIds: [], serviceIds: defaultServiceIds }]);
    setAddingName('');
    setAddingOpen(false);
  }

  const selectedPeople = people.filter((person) => person.selected);
  const apptPerson = selectedPeople[0] ?? null;
  const everyoneHasService = selectedPeople.length > 0 && selectedPeople.every((person) => person.serviceIds.length > 0);
  // A number is still needed when creating a new client (queue) or booking any appointment (which
  // resolves the client by phone). Existing profiles joined to the queue by clientId need none.
  const missingPhone = !phone.trim() && selectedPeople.length > 0 && (mode === 'appointment' || selectedPeople.some((person) => !person.clientId));

  // A single appointment time picker is on screen at a time — either booking on
  // the details page, or rescheduling on the status page — so one slots query,
  // keyed to whichever service set is in play, serves both.
  const slotServiceIds = rescheduling ? (apptStatus.data?.serviceIds ?? []) : (apptPerson?.serviceIds ?? []);
  const slotPrimaryServiceId = slotServiceIds[0] ?? '';
  const slotsEnabled = !!slotPrimaryServiceId && !!date && (rescheduling ? step === 'confirmed' : mode === 'appointment' && step === 'details');
  const slots = useQuery({
    queryKey: ['public-slots', params.locationId, slotServiceIds, staffId, date],
    queryFn: () => publicRequest<{ slots: Slot[] }>(`/public/locations/${params.locationId}/booking/slots?serviceId=${slotPrimaryServiceId}&serviceIds=${encodeURIComponent(slotServiceIds.join(','))}&date=${date}${staffId ? `&locationStaffId=${staffId}` : ''}`),
    enabled: slotsEnabled,
  });
  const uniqueTimes = useMemo(() => { const map = new Map<string, Slot>(); for (const item of slots.data?.slots ?? []) if (!map.has(item.startsAt)) map.set(item.startsAt, item); return [...map.values()]; }, [slots.data]);
  const visibleTimes = uniqueTimes.filter((item) => { const hour = new Date(item.startsAt).getHours(); return timePeriod === 'morning' ? hour < 12 : timePeriod === 'afternoon' ? hour >= 12 && hour < 17 : hour >= 17; });

  const joinQueue = useMutation({
    mutationFn: async () => {
      // Sequential, not Promise.all: everyone on one phone joins in list order
      // so the queue positions are deterministic, and two joins for the same
      // number never race to (re)bind that phone to a new profile.
      //
      // Because it is sequential and not one transaction, a later person can
      // fail after an earlier one is already in line. Collect what succeeded
      // and report who didn't, rather than throwing the whole batch away —
      // silently discarding it is what made a failed second join look like
      // "nothing happened", and invited a retry that double-booked the first.
      const results: QueueStatus[] = [];
      for (const person of selectedPeople) {
        const ids = person.serviceIds.length ? person.serviceIds : defaultServiceIds;
        try {
          results.push(await publicRequest<QueueStatus>(`/public/locations/${params.locationId}/queue/join`, {
            method: 'POST',
            body: JSON.stringify({ phone: person.clientId ? undefined : phone, clientId: person.clientId, name: person.clientId ? undefined : person.name, forceNewClient: !person.clientId, serviceId: ids[0], serviceIds: ids }),
          }));
        } catch (err) {
          const reason = err instanceof ApiError ? (err.body?.message ?? 'Could not join the queue.') : 'Could not join the queue.';
          return { results, failed: { name: person.name, reason } };
        }
      }
      return { results, failed: null };
    },
    onSuccess: ({ results, failed }) => {
      setJoinError(failed ? `${failed.name} couldn't be added — ${failed.reason}` : null);
      if (!results.length) return;
      const ids = results.map((r) => r.id);
      setQueueEntryIds(ids);
      window.history.replaceState(null, '', `${window.location.pathname}?queue=${ids.join(',')}`);
      setStep('confirmed');
    },
    onError: (err) => {
      setJoinError(err instanceof ApiError ? (err.body?.message ?? 'Could not join the queue.') : 'Could not join the queue.');
    },
  });

  const bookAppointment = useMutation({
    mutationFn: () => publicRequest<BookingConfirmation>(`/public/locations/${params.locationId}/booking`, {
      method: 'POST',
      body: JSON.stringify({ name: apptPerson?.name, phone, email: email || undefined, serviceId: slotPrimaryServiceId, serviceIds: apptPerson?.serviceIds, locationStaffId: staffId || slot?.locationStaffId, startsAt: slot?.startsAt }),
    }),
    onSuccess: (data) => {
      setAppointmentId(data.appointmentId);
      window.history.replaceState(null, '', `${window.location.pathname}?appt=${data.appointmentId}`);
      setStep('confirmed');
    },
  });

  const cancelQueueEntry = useMutation({
    mutationFn: (id: string) => publicRequest(`/public/locations/${params.locationId}/queue/${id}/cancel`, { method: 'POST' }),
    onSuccess: (_result, id) => {
      setCancelConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ['public-queue-status', params.locationId, id] });
      void queryClient.invalidateQueries({ queryKey: ['public-queue-snapshot', params.locationId] });
    },
  });

  const cancelAppointment = useMutation({
    mutationFn: () => publicRequest(`/public/locations/${params.locationId}/booking/${appointmentId}/cancel`, { method: 'POST' }),
    onSuccess: () => { setCancelConfirm(null); void apptStatus.refetch(); },
  });

  const rescheduleAppointment = useMutation({
    mutationFn: () => publicRequest(`/public/locations/${params.locationId}/booking/${appointmentId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startsAt: slot?.startsAt, locationStaffId: staffId || slot?.locationStaffId }),
    }),
    onSuccess: () => { setRescheduling(false); setSlot(null); void apptStatus.refetch(); },
  });

  function startReschedule() {
    const current = apptStatus.data;
    setStaffId(current?.locationStaffId ?? '');
    setDate((current?.startsAt ?? new Date().toISOString()).slice(0, 10));
    setSlot(null);
    setTimePeriod('morning');
    setRescheduling(true);
  }

  function backToMainMenu() {
    setStep('landing');
    setMode('queue');
    setPhone('');
    setPeople(emptyPeople);
    setDefaultServiceIds([]);
    setAddingOpen(false);
    setAddingName('');
    setStaffId('');
    setSlot(null);
    setEmail('');
    setQueueEntryIds([]);
    setAppointmentId(null);
    setCancelConfirm(null);
    setRescheduling(false);
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (catalog.isLoading) return <main className="mx-auto max-w-md px-4 py-10 text-center text-gray-500">Loading…</main>;
  if (catalog.isError || !catalog.data) return <main className="mx-auto max-w-md px-4 py-10 text-center"><h1 className="text-xl font-bold">Online booking unavailable</h1><p className="mt-2 text-gray-500">Please call the shop to schedule.</p></main>;

  const submitError = joinQueue.error ?? bookAppointment.error;
  const serviceOptions = catalog.data.services.map((service) => ({ ...service, duration_minutes: service.durationMinutes }));

  // The professional / date / time chooser — shared by "book" (details page) and
  // "reschedule" (status page). A plain render fn (no hooks) so it can appear in
  // either place while the single slots query above feeds it.
  function renderTimePicker() {
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-gray-500">Professional
            <select value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(null); }} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black">
              <option value="">Any available</option>
              {catalog.data!.staff.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-500">Date
            <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); setSlot(null); }} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black" />
          </label>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Available times</span>
            <div className="rounded-lg bg-stone-100 p-0.5">{(['morning', 'afternoon', 'evening'] as const).map((period) => <button key={period} onClick={() => setTimePeriod(period)} className={`rounded-md px-2.5 py-1 text-xs capitalize ${timePeriod === period ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>{period}</button>)}</div>
          </div>
          {slots.isLoading ? <p className="text-sm text-gray-400">Checking availability…</p> : uniqueTimes.length === 0 ? <p className="rounded-lg bg-stone-50 p-3 text-sm text-gray-500">No times available. Try another date or professional.</p> : visibleTimes.length === 0 ? <p className="rounded-lg bg-stone-50 p-3 text-sm text-gray-500">No {timePeriod} times available.</p> : (
            <div className="grid grid-cols-3 gap-2">
              {visibleTimes.map((item) => <button key={`${item.startsAt}-${item.locationStaffId}`} onClick={() => setSlot(item)} className={`rounded-lg border px-2 py-2 text-sm ${slot?.startsAt === item.startsAt && slot.locationStaffId === item.locationStaffId ? 'border-[#315c4f] bg-[#315c4f] text-white shadow-sm' : 'border-black/10 bg-white/70 hover:border-[#78988d] hover:bg-white'}`}>{new Date(item.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</button>)}
            </div>
          )}
        </div>
      </>
    );
  }

  return <main className="mx-auto min-h-[100dvh] max-w-md px-4 py-6 sm:py-10">
    <div className="mb-5 rounded-3xl border border-amber-200/50 bg-gradient-to-br from-[#fffdf7] via-white to-[#edf5f1] px-5 py-5 shadow-[0_12px_36px_rgba(55,45,30,0.07)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">{catalog.data.location.name}</div>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#20342d]">{step === 'landing' ? "How's the wait?" : step === 'confirmed' ? "You're all set" : mode === 'queue' ? "Who's coming in?" : 'Book your visit'}</h1>
      {step === 'landing' && <p className="mt-1 text-sm text-gray-500">See the current wait, then join the line or pick a time for later.</p>}
      {step === 'details' && <p className="mt-1 text-sm text-gray-500">{mode === 'queue' ? 'Pick who’s coming and what each person needs, then join the line.' : 'Choose services and a time, then book.'}</p>}
    </div>

    {step === 'landing' && (
      <div className="space-y-4">
        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-6 text-center shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          {snapshot.isLoading ? <p className="py-4 text-sm text-gray-400">Checking the line…</p> : (
            <>
              <div className="font-serif text-7xl font-medium leading-none tabular-nums text-[#20342d]">{minutesLabel(snapshot.data?.estimatedWaitMinutes ?? 0)}</div>
              <div className="mt-1.5 text-sm text-gray-500">minute estimated wait</div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-gray-600">
                <span className="tabular-nums">{snapshot.data?.waitingCount ?? 0}</span> {snapshot.data?.waitingCount === 1 ? 'person waiting' : 'people waiting'}
              </div>
              {!!snapshot.data?.entries.length && (
                <ol className="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-black/5 bg-stone-50/60 p-2 text-left">
                  {snapshot.data.entries.map((entry, index) => (
                    <li key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-gray-600">
                      <span className="w-5 shrink-0 text-right font-serif tabular-nums text-[#8b6f47]">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {entry.estimatedStart && <span className="shrink-0 tabular-nums text-gray-400">{new Date(entry.estimatedStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          <label className="block text-xs font-medium text-gray-500">Your name or phone number
            <input
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              type="text"
              autoComplete="name"
              placeholder="Jordan Lee — or 313-555-1212"
              className="mt-1.5 w-full rounded-xl border border-black/15 px-4 py-3 text-base"
            />
          </label>
          {lookupProfile.isError && <p className="mt-2 text-sm text-red-600">Could not look that up. Try again.</p>}
          <div className="mt-4 grid gap-2.5">
            <button
              disabled={lookupInput.trim().length < 2 || lookupProfile.isPending}
              onClick={() => enterFlow('queue')}
              className="rounded-2xl bg-[#294f44] px-5 py-4 text-left font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40"
            >
              {pendingMode === 'queue' && lookupProfile.isPending ? 'Loading…' : 'Join the queue'}
              <span className="mt-0.5 block text-sm font-normal text-white/70">Get in line now, on your way over</span>
            </button>
            <button
              disabled={lookupInput.trim().length < 2 || lookupProfile.isPending}
              onClick={() => enterFlow('appointment')}
              className="rounded-2xl border border-black/10 bg-white px-5 py-4 text-left font-semibold text-[#20342d] shadow-sm transition hover:border-[#78988d] disabled:opacity-40"
            >
              {pendingMode === 'appointment' && lookupProfile.isPending ? 'Loading…' : 'Book an appointment'}
              <span className="mt-0.5 block text-sm font-normal text-gray-500">Pick a professional and time for later</span>
            </button>
          </div>
        </section>
      </div>
    )}

    {step === 'details' && (
      <div className="space-y-4">
        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{mode === 'queue' ? "Who's coming in?" : 'Who is this for?'}</h2>
            <div className="rounded-lg bg-stone-100 p-0.5">
              <button onClick={() => { setMode('queue'); setSlot(null); }} className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'queue' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Join queue</button>
              <button onClick={() => { setMode('appointment'); setPeople((cur) => { const firstSelected = cur.find((p) => p.selected) ?? cur[0]; return cur.map((p) => ({ ...p, selected: p.key === firstSelected?.key })); }); setSlot(null); }} className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'appointment' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Appointment</button>
            </div>
          </div>
          <p className="mb-3 text-sm text-gray-500">{
            people.some((person) => person.maskedPhone)
              ? 'More than one profile matches that name — pick yours by the last digits of your number.'
              : people.length > 0
                ? (mode === 'queue' ? 'Select everyone joining the line.' : "Who's this appointment for?")
                : "We don't have this number on file yet — what's your name?"
          }</p>
          {people.length > 0 && (
            <div className="space-y-1">
              {people.map((person) => (
                <label key={person.key} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-stone-50">
                  <input
                    type={mode === 'appointment' ? 'radio' : 'checkbox'}
                    name={mode === 'appointment' ? 'appt-person' : undefined}
                    checked={mode === 'appointment' ? person.key === apptPerson?.key : person.selected}
                    onChange={() => mode === 'appointment' ? selectOnlyPerson(person.key) : togglePerson(person.key)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-[#20342d]">{person.name}</span>
                  {person.maskedPhone && <span className="font-mono text-xs tracking-widest text-gray-500">{person.maskedPhone}</span>}
                  {!person.clientId && <span className="text-xs text-gray-400">new</span>}
                </label>
              ))}
            </div>
          )}
          {mode === 'queue' && (addingOpen ? (
            <div className="mt-3 flex gap-2">
              <input autoFocus value={addingName} onChange={(e) => setAddingName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmAddPerson(); }} placeholder="Name" className="flex-1 rounded-xl border border-black/15 px-3 py-2.5 text-sm" />
              <button onClick={confirmAddPerson} className="rounded-xl bg-[#294f44] px-4 text-sm font-semibold text-white">Add</button>
            </div>
          ) : (
            <button onClick={() => setAddingOpen(true)} className="mt-3 w-full rounded-xl border border-dashed border-black/15 px-3 py-2.5 text-sm font-medium text-[#294f44] hover:bg-stone-50">+ Add another person</button>
          ))}
          {mode === 'appointment' && people.length === 0 && (
            <input value={addingName} onChange={(e) => { const v = e.target.value; setAddingName(v); setPeople(v.trim() ? [{ key: 'self', name: v.trim(), selected: true, suggestedServiceIds: [], serviceIds: defaultServiceIds }] : []); }} placeholder="Your name" className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm" />
          )}
          {missingPhone && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500">Your phone number
                <input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="313-555-1212" className="mt-1.5 w-full rounded-xl border border-black/15 px-4 py-2.5 text-base" />
              </label>
              <p className="mt-1 text-xs text-gray-400">So we can text you about your visit.</p>
            </div>
          )}
        </section>

        {mode === 'queue' ? (
          selectedPeople.map((person) => (
            <section key={person.key} className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
              <div className="mb-2 text-sm font-semibold text-[#20342d]">{person.name}’s services</div>
              <ServiceMultiPicker services={serviceOptions} selectedIds={person.serviceIds} onChange={(ids) => setPersonServices(person.key, ids)} helperText="Add everything this person plans to have done so we reserve enough time." />
            </section>
          ))
        ) : (
          <>
            <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
              <h2 className="mb-3 font-semibold">Services</h2>
              <p className="mb-3 text-xs text-gray-400">For {apptPerson?.name ?? 'you'}</p>
              <ServiceMultiPicker services={serviceOptions} selectedIds={apptPerson?.serviceIds ?? []} onChange={(ids) => apptPerson && setPersonServices(apptPerson.key, ids)} helperText="Add everything you plan to have done so we reserve enough time for your complete visit." />
            </section>
            <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
              <h2 className="mb-3 font-semibold">Professional & date</h2>
              {renderTimePicker()}
              <label className="mt-4 block text-xs font-medium text-gray-500">Email <span className="font-normal text-gray-400">(optional)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
            </section>
          </>
        )}

        {submitError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {submitError instanceof ApiError ? (submitError.body?.title ? `${submitError.body.title} — ${submitError.body.message}` : submitError.body?.message) ?? 'Something went wrong.' : 'Something went wrong.'}
        </p>}

        {joinError && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{joinError}</p>}
        <div className="flex items-center justify-between pb-2">
          <button onClick={() => setStep('landing')} className="text-sm text-gray-500 hover:text-black">← Back</button>
          {mode === 'queue' ? (
            <button disabled={!everyoneHasService || missingPhone || joinQueue.isPending} onClick={() => { setJoinError(null); joinQueue.mutate(); }} className="rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">{joinQueue.isPending ? 'Joining…' : selectedPeople.length > 1 ? `Join the queue (${selectedPeople.length})` : 'Join the queue'}</button>
          ) : (
            <button disabled={!slot || !apptPerson?.name.trim() || !(apptPerson?.serviceIds.length) || !phone.trim() || bookAppointment.isPending} onClick={() => bookAppointment.mutate()} className="rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">{bookAppointment.isPending ? 'Booking…' : slot ? `Book ${new Date(slot.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Choose a time to continue'}</button>
          )}
        </div>
      </div>
    )}

    {step === 'confirmed' && mode === 'queue' && (
      <div className="space-y-4">
        <div className="space-y-3">
          {queueStatuses.map((query, index) => {
            const id = queueEntryIds[index];
            const data = query.data;
            const confirming = cancelConfirm === id;
            return (
              <div key={id} className="rounded-3xl border border-green-200 bg-green-50 p-6 text-center">
                {query.isLoading ? <p className="text-gray-600">Getting your spot…</p> : data ? (
                  data.status !== 'waiting' ? (
                    <p className="text-gray-600">Status: <strong>{data.status.replace('_', ' ')}</strong></p>
                  ) : (
                    <>
                      <div className="font-serif text-6xl font-medium leading-none tabular-nums text-[#20342d]">#{data.position}</div>
                      <div className="mt-2 text-sm text-gray-600">in line{data.aheadOfCount ? ` · ${data.aheadOfCount} ahead` : ''}</div>
                      {data.estimatedStart && <p className="mt-2 text-gray-600">Estimated seating: <strong>{new Date(data.estimatedStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></p>}
                      <p className="mt-1 text-sm text-gray-500">{data.serviceName}{data.staffName ? ` · ${data.staffName}` : ''}</p>
                      <div className="mt-4">
                        {confirming ? (
                          <div className="flex items-center justify-center gap-3">
                            <button disabled={cancelQueueEntry.isPending} onClick={() => cancelQueueEntry.mutate(id)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{cancelQueueEntry.isPending ? 'Cancelling…' : 'Yes, cancel my spot'}</button>
                            <button disabled={cancelQueueEntry.isPending} onClick={() => setCancelConfirm(null)} className="text-sm text-gray-500 underline hover:text-black">Keep it</button>
                          </div>
                        ) : (
                          <button onClick={() => setCancelConfirm(id)} className="text-sm font-medium text-red-600 hover:underline">Cancel my spot</button>
                        )}
                      </div>
                    </>
                  )
                ) : <p className="text-gray-600">We couldn't find that spot in line anymore.</p>}
              </div>
            );
          })}
          <p className="text-center text-xs text-gray-400">This updates automatically. Keep this page open or bookmark it — it'll still show your spot if you come back.</p>
        </div>

        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-6 text-center shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          <h2 className="mb-3 text-left font-semibold text-[#20342d]">The whole line</h2>
          {snapshot.isLoading ? <p className="py-4 text-sm text-gray-400">Checking the line…</p> : (
            <>
              <div className="font-serif text-5xl font-medium leading-none tabular-nums text-[#20342d]">{minutesLabel(snapshot.data?.estimatedWaitMinutes ?? 0)}</div>
              <div className="mt-1.5 text-sm text-gray-500">minute estimated wait</div>
              {!!snapshot.data?.entries.length && (
                <ol className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/5 bg-stone-50/60 p-2 text-left">
                  {snapshot.data.entries.map((entry, index) => (
                    <li key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-gray-600">
                      <span className="w-5 shrink-0 text-right font-serif tabular-nums text-[#8b6f47]">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {entry.estimatedStart && <span className="shrink-0 tabular-nums text-gray-400">{new Date(entry.estimatedStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        <button onClick={backToMainMenu} className="w-full rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#20342d] shadow-sm transition hover:border-[#78988d]">← Back to main menu</button>
      </div>
    )}

    {step === 'confirmed' && mode === 'appointment' && (
      <div className="space-y-4">
        {apptStatus.isLoading ? (
          <div className="rounded-3xl border border-black/[0.06] bg-white/85 p-6 text-center text-gray-500">Loading your appointment…</div>
        ) : apptStatus.data ? (
          apptStatus.data.status === 'cancelled' ? (
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-6 text-center">
              <div className="text-sm font-semibold text-gray-700">Appointment cancelled</div>
              <p className="mt-2 text-gray-600">This appointment has been cancelled. Book again anytime.</p>
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-green-200 bg-green-50 p-6 text-center">
                <div className="text-sm font-semibold text-green-800">Appointment {apptStatus.data.status === 'confirmed' ? 'confirmed' : 'booked'}</div>
                <h1 className="mt-2 text-2xl font-bold">You're all set.</h1>
                <p className="mt-2 text-gray-600">{new Date(apptStatus.data.startsAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p>
                <p className="mt-1 text-sm text-gray-500">{apptStatus.data.serviceNames.join(' + ')}{apptStatus.data.staffName ? ` · ${apptStatus.data.staffName}` : ''}</p>
                {apptStatus.data.confirmationCode && <p className="mt-4 text-sm">Confirmation code: <strong>{apptStatus.data.confirmationCode}</strong></p>}
              </div>

              {rescheduling ? (
                <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
                  <h2 className="mb-3 font-semibold">Pick a new time</h2>
                  {renderTimePicker()}
                  {rescheduleAppointment.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{rescheduleAppointment.error instanceof ApiError ? (rescheduleAppointment.error.body?.message ?? 'Could not reschedule.') : 'Could not reschedule.'}</p>}
                  <div className="mt-4 flex items-center justify-between">
                    <button onClick={() => { setRescheduling(false); setSlot(null); }} className="text-sm text-gray-500 hover:text-black">Cancel</button>
                    <button disabled={!slot || rescheduleAppointment.isPending} onClick={() => rescheduleAppointment.mutate()} className="rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">{rescheduleAppointment.isPending ? 'Saving…' : slot ? `Move to ${new Date(slot.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Choose a new time'}</button>
                  </div>
                </section>
              ) : (
                <div className="grid gap-2.5">
                  <button onClick={startReschedule} className="rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#20342d] shadow-sm transition hover:border-[#78988d]">Reschedule</button>
                  {cancelConfirm === 'appt' ? (
                    <div className="flex items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <span className="text-sm text-red-700">Cancel this appointment?</span>
                      <button disabled={cancelAppointment.isPending} onClick={() => cancelAppointment.mutate()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{cancelAppointment.isPending ? 'Cancelling…' : 'Yes, cancel'}</button>
                      <button disabled={cancelAppointment.isPending} onClick={() => setCancelConfirm(null)} className="text-sm text-gray-500 underline hover:text-black">Keep it</button>
                    </div>
                  ) : (
                    <button onClick={() => setCancelConfirm('appt')} className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-50">Cancel appointment</button>
                  )}
                </div>
              )}
            </>
          )
        ) : (
          <div className="rounded-3xl border border-black/[0.06] bg-white/85 p-6 text-center text-gray-500">We couldn't find that appointment.</div>
        )}

        <button onClick={backToMainMenu} className="w-full rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#20342d] shadow-sm transition hover:border-[#78988d]">← Back to main menu</button>
      </div>
    )}
  </main>;
}
