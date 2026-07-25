'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { API_URL, ApiError } from '../../../lib/api';
import { formatPhoneInput } from '../../../lib/phone';

type Catalog = { location: { name: string } };

async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export default function FeedbackPage({ params }: { params: { locationId: string } }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  const catalog = useQuery({ queryKey: ['feedback-catalog', params.locationId], queryFn: () => publicRequest<Catalog>(`/public/locations/${params.locationId}/booking`) });

  const submit = useMutation({
    mutationFn: () => publicRequest(`/public/locations/${params.locationId}/complaints`, {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined, message: message.trim() }),
    }),
  });

  const locationName = catalog.data?.location.name ?? '';

  return <main className="mx-auto min-h-screen max-w-md px-4 py-6 sm:py-10">
    <div className="mb-5 rounded-3xl border border-amber-200/50 bg-gradient-to-br from-[#fffdf7] via-white to-[#edf5f1] px-5 py-5 shadow-[0_12px_36px_rgba(55,45,30,0.07)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">{locationName}</div>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#20342d]">{submit.isSuccess ? 'Thank you' : 'Tell us what went wrong'}</h1>
      {!submit.isSuccess && <p className="mt-1 text-sm text-gray-500">We read every message. Share what happened and we’ll make it right.</p>}
    </div>

    {submit.isSuccess ? (
      <section className="rounded-3xl border border-green-200 bg-green-50 p-6 text-center shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
        <div className="text-2xl">🙏</div>
        <p className="mt-2 text-gray-700">Thanks, {name.trim().split(' ')[0] || 'friend'} — your feedback reached the team. If you left a number, someone may reach out.</p>
        <button onClick={() => { setName(''); setPhone(''); setMessage(''); submit.reset(); }} className="mt-4 rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-[#20342d] shadow-sm transition hover:border-[#78988d]">Send another</button>
      </section>
    ) : (
      <section className="space-y-3 rounded-3xl border border-black/[0.06] bg-white/85 p-5 shadow-[0_8px_24px_rgba(60,48,30,0.04)]">
        <label className="block text-xs font-medium text-gray-500">Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mt-1.5 w-full rounded-xl border border-black/15 px-4 py-3 text-base" />
        </label>
        <label className="block text-xs font-medium text-gray-500">Phone <span className="font-normal text-gray-400">(optional — so we can follow up)</span>
          <input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="313-555-1212" className="mt-1.5 w-full rounded-xl border border-black/15 px-4 py-3 text-base" />
        </label>
        <label className="block text-xs font-medium text-gray-500">What happened?
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Tell us about your visit…" className="mt-1.5 w-full rounded-xl border border-black/15 px-4 py-3 text-base" />
        </label>
        {submit.isError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{submit.error instanceof ApiError ? (submit.error.body?.message ?? 'Could not send — please try again.') : 'Could not send — please try again.'}</p>}
        <button
          disabled={!name.trim() || message.trim().length < 3 || submit.isPending}
          onClick={() => submit.mutate()}
          className="w-full rounded-2xl bg-[#294f44] px-5 py-4 font-semibold text-[#fffdf7] shadow-md transition hover:bg-[#1f4037] disabled:opacity-40"
        >
          {submit.isPending ? 'Sending…' : 'Send feedback'}
        </button>
      </section>
    )}
  </main>;
}
