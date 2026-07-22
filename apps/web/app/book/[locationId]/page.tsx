'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { API_URL, ApiError } from '../../../lib/api';
import { formatPhoneInput } from '../../../lib/phone';
import { ServiceMultiPicker } from '../../../components/service-multi-picker';

type Catalog = { location: { name: string }; services: { id: string; name: string; durationMinutes: number; price: string }[]; staff: { id: string; fullName: string }[] };
type Slot = { startsAt: string; locationStaffId: string; staffName: string };

async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export default function PublicBookingPage({ params }: { params: { locationId: string } }) {
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); });
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [timePeriod, setTimePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');

  const catalog = useQuery({ queryKey: ['public-booking', params.locationId], queryFn: () => publicRequest<Catalog>(`/public/locations/${params.locationId}/booking`) });
  const effectiveServiceIds = serviceIds.length ? serviceIds : catalog.data?.services[0]?.id ? [catalog.data.services[0].id] : [];
  const effectiveServiceId = effectiveServiceIds[0] ?? '';
  const slots = useQuery({ queryKey: ['public-slots', params.locationId, effectiveServiceIds, staffId, date], queryFn: () => publicRequest<{ slots: Slot[] }>(`/public/locations/${params.locationId}/booking/slots?serviceId=${effectiveServiceId}&serviceIds=${encodeURIComponent(effectiveServiceIds.join(','))}&date=${date}${staffId ? `&locationStaffId=${staffId}` : ''}`), enabled: !!effectiveServiceId && !!date });
  const uniqueTimes = useMemo(() => { const map = new Map<string, Slot>(); for (const item of slots.data?.slots ?? []) if (!map.has(item.startsAt)) map.set(item.startsAt, item); return [...map.values()]; }, [slots.data]);
  const visibleTimes = uniqueTimes.filter((item) => { const hour = new Date(item.startsAt).getHours(); return timePeriod === 'morning' ? hour < 12 : timePeriod === 'afternoon' ? hour >= 12 && hour < 17 : hour >= 17; });
  const book = useMutation({ mutationFn: () => publicRequest<{ confirmationCode: string; startsAt: string; messageQueued: boolean }>(`/public/locations/${params.locationId}/booking`, { method: 'POST', body: JSON.stringify({ name, phone, email: email || undefined, serviceId: effectiveServiceId, serviceIds: effectiveServiceIds, locationStaffId: staffId || slot?.locationStaffId, startsAt: slot?.startsAt }) }) });

  if (catalog.isLoading) return <main className="mx-auto max-w-2xl p-8 text-gray-500">Loading booking options…</main>;
  if (catalog.isError || !catalog.data) return <main className="mx-auto max-w-2xl p-8"><h1 className="text-xl font-bold">Online booking unavailable</h1><p className="mt-2 text-gray-500">Please call the shop to schedule.</p></main>;
  if (book.isSuccess) return <main className="mx-auto max-w-lg p-8"><div className="rounded-2xl border border-green-200 bg-green-50 p-6"><div className="text-sm font-semibold text-green-800">Appointment booked</div><h1 className="mt-2 text-2xl font-bold">You're all set.</h1><p className="mt-2 text-gray-600">{new Date(book.data.startsAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p><p className="mt-4 text-sm">Confirmation code: <strong>{book.data.confirmationCode}</strong></p>{book.data.messageQueued && <p className="mt-2 text-xs text-gray-500">A confirmation message has been queued for delivery.</p>}</div></main>;

  return <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
    <div className="mb-8 rounded-[2rem] border border-amber-200/50 bg-gradient-to-br from-[#fffdf7] via-white to-[#edf5f1] p-6 shadow-[0_18px_50px_rgba(55,45,30,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">{catalog.data.location.name}</div><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#20342d]">Book your visit</h1><p className="mt-2 text-gray-500">Choose what you need and find a time that feels right.</p></div>
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/[0.07] bg-white/80 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]"><h2 className="mb-3 font-semibold">1. Services</h2><ServiceMultiPicker services={catalog.data.services.map((service) => ({ ...service, duration_minutes: service.durationMinutes }))} selectedIds={effectiveServiceIds} onChange={(ids) => { setServiceIds(ids); setSlot(null); }} helperText="Add everything you plan to have done so we reserve enough time for your complete visit." /></section>
      <section className="rounded-2xl border border-black/[0.07] bg-white/80 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]"><h2 className="font-semibold">2. Professional & date</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-gray-500">Professional<select value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(null); }} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black"><option value="">Any available</option>{catalog.data.staff.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label className="text-xs font-medium text-gray-500">Date<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); setSlot(null); }} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black" /></label></div><div className="mt-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-gray-500">Available times</span><div className="rounded-lg bg-stone-100 p-0.5">{(['morning','afternoon','evening'] as const).map((period) => <button key={period} onClick={() => setTimePeriod(period)} className={`rounded-md px-2.5 py-1 text-xs capitalize ${timePeriod === period ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>{period}</button>)}</div></div>{slots.isLoading ? <p className="text-sm text-gray-400">Checking availability…</p> : uniqueTimes.length === 0 ? <p className="rounded-lg bg-stone-50 p-3 text-sm text-gray-500">No times available. Try another date or professional.</p> : visibleTimes.length === 0 ? <p className="rounded-lg bg-stone-50 p-3 text-sm text-gray-500">No {timePeriod} times available.</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{visibleTimes.map((item) => <button key={`${item.startsAt}-${item.locationStaffId}`} onClick={() => setSlot(item)} className={`rounded-lg border px-3 py-2 text-sm ${slot?.startsAt === item.startsAt && slot.locationStaffId === item.locationStaffId ? 'border-[#315c4f] bg-[#315c4f] text-white shadow-sm' : 'border-black/10 bg-white/70 hover:border-[#78988d] hover:bg-white'}`}>{new Date(item.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</button>)}</div>}</div></section>
      <section className="rounded-2xl border border-black/[0.07] bg-white/80 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]"><h2 className="font-semibold">3. Your details</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-gray-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-gray-500">Mobile phone<input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="313-555-1212" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-gray-500 sm:col-span-2">Email <span className="font-normal text-gray-400">(optional)</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" /></label></div></section>
      {book.isError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{book.error instanceof ApiError ? book.error.body?.message ?? 'Could not book that time.' : 'Could not book that time.'}</p>}
      <button disabled={!slot || !name.trim() || !phone.trim() || book.isPending} onClick={() => book.mutate()} className="w-full rounded-xl bg-[#294f44] px-5 py-3 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40">{book.isPending ? 'Booking…' : slot ? `Book ${new Date(slot.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Choose a time to continue'}</button>
    </div>
  </main>;
}
