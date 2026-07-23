'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { API_URL, ApiError } from '../../../lib/api';
import { formatPhoneInput } from '../../../lib/phone';
import { ServiceMultiPicker } from '../../../components/service-multi-picker';

type Catalog = { location: { name: string }; services: { id: string; name: string; durationMinutes: number; price: string }[]; staff: { id: string; fullName: string }[] };
type Slot = { startsAt: string; locationStaffId: string; staffName: string };
type Snapshot = { waitingCount: number; estimatedWaitMinutes: number; entries: { id: string; label: string }[] };
type ProfileLookup = { isNewClient: boolean; people: { clientId: string; name: string; suggestedServiceIds: string[] }[]; defaultServiceIds: string[] };
type QueueStatus = { id: string; status: string; present: boolean; serviceName: string | null; staffName: string | null; position: number | null; aheadOfCount: number | null; estimatedStart: string | null };
type BookingConfirmation = { confirmationCode: string; startsAt: string; messageQueued: boolean };

/** A person on the "who's checking in" list — either a profile already on file (clientId set) or a name just typed in, not yet a client record until they're actually joined/booked. */
type Person = { key: string; clientId?: string; name: string; selected: boolean; suggestedServiceIds: string[] };

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

type Step = 'landing' | 'people' | 'details' | 'confirmed';
type Mode = 'queue' | 'appointment';

const emptyPeople: Person[] = [];

export default function PublicBookingPage({ params }: { params: { locationId: string } }) {
  const [step, setStep] = useState<Step>('landing');
  const [mode, setMode] = useState<Mode>('queue');
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [phone, setPhone] = useState('');
  const [people, setPeople] = useState<Person[]>(emptyPeople);
  const [addingName, setAddingName] = useState('');
  const [addingOpen, setAddingOpen] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [timePeriod, setTimePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  const [email, setEmail] = useState('');
  const [queueEntryIds, setQueueEntryIds] = useState<string[]>([]);
  const [appointment, setAppointment] = useState<BookingConfirmation | null>(null);

  // Joined queue entries' ids live in the URL so reopening/reloading this
  // page keeps showing live status without re-entering a phone number.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('queue');
    if (fromUrl) {
      setQueueEntryIds(fromUrl.split(',').filter(Boolean));
      setMode('queue');
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

  const lookupProfile = useMutation({
    mutationFn: () => publicRequest<ProfileLookup>(`/public/locations/${params.locationId}/queue/last-service?phone=${encodeURIComponent(phone)}`),
    onSuccess: (data) => {
      const found = data.people.map((person) => ({ key: person.clientId, clientId: person.clientId, name: person.name, selected: true, suggestedServiceIds: person.suggestedServiceIds }));
      setPeople(found);
      setServiceIds(found[0]?.suggestedServiceIds.length ? found[0].suggestedServiceIds : data.defaultServiceIds);
      setAddingOpen(found.length === 0);
      setStep('people');
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

  function confirmAddPerson() {
    const trimmed = addingName.trim();
    if (!trimmed) return;
    setPeople((current) => [...current, { key: `new-${Date.now()}`, name: trimmed, selected: true, suggestedServiceIds: [] }]);
    setAddingName('');
    setAddingOpen(false);
  }

  const selectedPeople = people.filter((person) => person.selected);
  const effectiveServiceIds = serviceIds.length ? serviceIds : catalog.data?.services[0]?.id ? [catalog.data.services[0].id] : [];
  const effectiveServiceId = effectiveServiceIds[0] ?? '';

  const slots = useQuery({
    queryKey: ['public-slots', params.locationId, effectiveServiceIds, staffId, date],
    queryFn: () => publicRequest<{ slots: Slot[] }>(`/public/locations/${params.locationId}/booking/slots?serviceId=${effectiveServiceId}&serviceIds=${encodeURIComponent(effectiveServiceIds.join(','))}&date=${date}${staffId ? `&locationStaffId=${staffId}` : ''}`),
    enabled: mode === 'appointment' && step === 'details' && !!effectiveServiceId && !!date,
  });
  const uniqueTimes = useMemo(() => { const map = new Map<string, Slot>(); for (const item of slots.data?.slots ?? []) if (!map.has(item.startsAt)) map.set(item.startsAt, item); return [...map.values()]; }, [slots.data]);
  const visibleTimes = uniqueTimes.filter((item) => { const hour = new Date(item.startsAt).getHours(); return timePeriod === 'morning' ? hour < 12 : timePeriod === 'afternoon' ? hour >= 12 && hour < 17 : hour >= 17; });

  const joinQueue = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(selectedPeople.map((person) => publicRequest<QueueStatus>(`/public/locations/${params.locationId}/queue/join`, {
        method: 'POST',
        body: JSON.stringify({ phone, clientId: person.clientId, name: person.clientId ? undefined : person.name, forceNewClient: !person.clientId, serviceId: effectiveServiceId, serviceIds: effectiveServiceIds }),
      })));
      return results;
    },
    onSuccess: (results) => {
      const ids = results.map((r) => r.id);
      setQueueEntryIds(ids);
      window.history.replaceState(null, '', `${window.location.pathname}?queue=${ids.join(',')}`);
      setStep('confirmed');
    },
  });

  const bookAppointment = useMutation({
    mutationFn: () => publicRequest<BookingConfirmation>(`/public/locations/${params.locationId}/booking`, {
      method: 'POST',
      body: JSON.stringify({ name: selectedPeople[0]?.name, phone, email: email || undefined, serviceId: effectiveServiceId, serviceIds: effectiveServiceIds, locationStaffId: staffId || slot?.locationStaffId, startsAt: slot?.startsAt }),
    }),
    onSuccess: (data) => { setAppointment(data); setStep('confirmed'); },
  });

  function backToMainMenu() {
    setStep('landing');
    setMode('queue');
    setPhone('');
    setPeople(emptyPeople);
    setAddingOpen(false);
    setAddingName('');
    setServiceIds([]);
    setStaffId('');
    setSlot(null);
    setEmail('');
    setQueueEntryIds([]);
    setAppointment(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (catalog.isLoading) return <main className="mx-auto max-w-md px-4 py-10 text-center text-gray-500">Loading…</main>;
  if (catalog.isError || !catalog.data) return <main className="mx-auto max-w-md px-4 py-10 text-center"><h1 className="text-xl font-bold">Online booking unavailable</h1><p className="mt-2 text-gray-500">Please call the shop to schedule.</p></main>;

  const submitError = joinQueue.error ?? bookAppointment.error;

  return <main className="mx-auto min-h-screen max-w-md px-4 py-6 sm:py-10">
    <div className="mb-5 rounded-3xl border border-amber-200/50 bg-gradient-to-br from-[#fffdf7] via-white to-[#edf5f1] px-5 py-5 shadow-[0_12px_36px_rgba(55,45,30,0.07)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">{catalog.data.location.name}</div>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#20342d]">{step === 'landing' ? "How's the wait?" : step === 'confirmed' ? "You're all set" : mode === 'queue' ? "Who's checking in?" : 'Book your visit'}</h1>
      {step === 'landing' && <p className="mt-1 text-sm text-gray-500">See the current wait, then join the line or pick a time for later.</p>}
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
                      <span className="truncate">{entry.label}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          <label className="block text-xs font-medium text-gray-500">Your phone number
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="313-555-1212"
              className="mt-1.5 w-full rounded-xl border border-black/15 px-4 py-3 text-base"
            />
          </label>
          {lookupProfile.isError && <p className="mt-2 text-sm text-red-600">Could not look that up. Try again.</p>}
          <div className="mt-4 grid gap-2.5">
            <button
              disabled={!phone.trim() || lookupProfile.isPending}
              onClick={() => enterFlow('queue')}
              className="rounded-2xl bg-[#294f44] px-5 py-4 text-left font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40"
            >
              {pendingMode === 'queue' && lookupProfile.isPending ? 'Loading…' : 'Join the queue'}
              <span className="mt-0.5 block text-sm font-normal text-white/70">Get in line now, on your way over</span>
            </button>
            <button
              disabled={!phone.trim() || lookupProfile.isPending}
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

    {step === 'people' && (
      <div className="space-y-4">
        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          <p className="mb-3 text-sm text-gray-500">{people.length > 0 ? (mode === 'queue' ? 'Select everyone joining the line.' : "Who's this appointment for?") : "We don't have this number on file yet — what's your name?"}</p>
          {people.length > 0 && (
            <div className="space-y-1">
              {people.map((person) => (
                <label key={person.key} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-stone-50">
                  <input
                    type={mode === 'appointment' ? 'radio' : 'checkbox'}
                    checked={person.selected}
                    onChange={() => mode === 'appointment' ? setPeople((current) => current.map((p) => ({ ...p, selected: p.key === person.key }))) : togglePerson(person.key)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-[#20342d]">{person.name}</span>
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
            <input value={addingName} onChange={(e) => { setAddingName(e.target.value); setPeople(e.target.value.trim() ? [{ key: 'self', name: e.target.value.trim(), selected: true, suggestedServiceIds: [] }] : []); }} placeholder="Your name" className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm" />
          )}
        </section>
        <div className="flex items-center justify-between">
          <button onClick={() => setStep('landing')} className="text-sm text-gray-500 hover:text-black">← Back</button>
          <button disabled={selectedPeople.length === 0} onClick={() => setStep('details')} className="rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">Continue</button>
        </div>
      </div>
    )}

    {step === 'details' && (
      <div className="space-y-4">
        <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Services</h2>
            <div className="rounded-lg bg-stone-100 p-0.5">
              <button onClick={() => setMode('queue')} className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'queue' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Join queue</button>
              <button onClick={() => setMode('appointment')} className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'appointment' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Appointment</button>
            </div>
          </div>
          <p className="mb-3 text-xs text-gray-400">For {selectedPeople.map((p) => p.name).join(', ')}{selectedPeople.length > 1 ? ' (same service for everyone)' : ''}</p>
          <ServiceMultiPicker services={catalog.data.services.map((service) => ({ ...service, duration_minutes: service.durationMinutes }))} selectedIds={effectiveServiceIds} onChange={(ids) => { setServiceIds(ids); setSlot(null); }} helperText="Add everything you plan to have done so we reserve enough time for your complete visit." />
        </section>

        {mode === 'appointment' && (
          <section className="rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
            <h2 className="font-semibold">Professional & date</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-500">Professional
                <select value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(null); }} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black">
                  <option value="">Any available</option>
                  {catalog.data.staff.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
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
            <label className="mt-4 block text-xs font-medium text-gray-500">Email <span className="font-normal text-gray-400">(optional)</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
            </label>
          </section>
        )}

        {submitError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {submitError instanceof ApiError ? (submitError.body?.title ? `${submitError.body.title} — ${submitError.body.message}` : submitError.body?.message) ?? 'Something went wrong.' : 'Something went wrong.'}
        </p>}

        <div className="flex items-center justify-between pb-2">
          <button onClick={() => setStep('people')} className="text-sm text-gray-500 hover:text-black">← Back</button>
          {mode === 'queue' ? (
            <button disabled={!effectiveServiceId || selectedPeople.length === 0 || joinQueue.isPending} onClick={() => joinQueue.mutate()} className="rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">{joinQueue.isPending ? 'Joining…' : selectedPeople.length > 1 ? `Join the queue (${selectedPeople.length})` : 'Join the queue'}</button>
          ) : (
            <button disabled={!slot || !selectedPeople[0]?.name.trim() || !phone.trim() || bookAppointment.isPending} onClick={() => bookAppointment.mutate()} className="rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">{bookAppointment.isPending ? 'Booking…' : slot ? `Book ${new Date(slot.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Choose a time to continue'}</button>
          )}
        </div>
      </div>
    )}

    {step === 'confirmed' && mode === 'queue' && (
      <div className="space-y-4">
        <div className="space-y-3">
          {queueStatuses.map((query, index) => {
            const data = query.data;
            return (
              <div key={queueEntryIds[index]} className="rounded-3xl border border-green-200 bg-green-50 p-6 text-center">
                {query.isLoading ? <p className="text-gray-600">Getting your spot…</p> : data ? (
                  data.status !== 'waiting' ? (
                    <p className="text-gray-600">Status: <strong>{data.status.replace('_', ' ')}</strong></p>
                  ) : (
                    <>
                      <div className="font-serif text-6xl font-medium leading-none tabular-nums text-[#20342d]">#{data.position}</div>
                      <div className="mt-2 text-sm text-gray-600">in line{data.aheadOfCount ? ` · ${data.aheadOfCount} ahead` : ''}</div>
                      {data.estimatedStart && <p className="mt-2 text-gray-600">Estimated seating: <strong>{new Date(data.estimatedStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></p>}
                      <p className="mt-1 text-sm text-gray-500">{data.serviceName}{data.staffName ? ` · ${data.staffName}` : ''}</p>
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
                      <span className="truncate">{entry.label}</span>
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

    {step === 'confirmed' && mode === 'appointment' && appointment && (
      <div className="space-y-4">
        <div className="rounded-3xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="text-sm font-semibold text-green-800">Appointment booked</div>
          <h1 className="mt-2 text-2xl font-bold">You're all set.</h1>
          <p className="mt-2 text-gray-600">{new Date(appointment.startsAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p>
          <p className="mt-4 text-sm">Confirmation code: <strong>{appointment.confirmationCode}</strong></p>
          {appointment.messageQueued && <p className="mt-2 text-xs text-gray-500">A confirmation message has been queued for delivery.</p>}
        </div>
        <button onClick={backToMainMenu} className="w-full rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#20342d] shadow-sm transition hover:border-[#78988d]">← Back to main menu</button>
      </div>
    )}
  </main>;
}
