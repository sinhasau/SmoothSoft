'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { formatPhoneInput } from '../../../../lib/phone';
import { Card, Pill } from '../../../../components/ui';

interface Client {
  id: string;
  name: string;
  phone_display: string | null;
  allergy_flag: boolean;
}

export default function ClientsPage({ params }: { params: { locationId: string } }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['clients', 'search', q],
    queryFn: () => api.get<Client[]>(`/clients?q=${encodeURIComponent(q)}`),
    // Keep the current list in place while a new search arrives so typing never
    // flashes a misleading "No matching clients" empty state.
    placeholderData: (previousData) => previousData,
  });

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Relationships</p>
          <h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Clients</h1>
          <p className="mt-1 text-sm text-gray-500">Find a familiar face, review their history, or prepare for their next visit.</p>
        </div>
        {data && <span className="rounded-full border border-[#cfded7] bg-[#f2f7f4] px-3 py-1 text-xs font-semibold text-[#315c4f]">{data.length} {q ? 'matching' : 'on file'}</span>}
      </header>

      <label className="flex max-w-xl items-center gap-3 rounded-2xl border border-black/[0.07] bg-white/85 px-4 py-3 shadow-[0_8px_24px_rgba(60,48,30,0.05)] focus-within:border-[#78988d] focus-within:ring-4 focus-within:ring-[#78988d]/10">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#6f8079]"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span className="sr-only">Search clients</span>
        <input
          aria-label="Search clients"
          className="w-full border-0 bg-transparent p-0 text-base shadow-none outline-none placeholder:text-gray-400 focus:shadow-none"
          placeholder="Search by name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && <button type="button" aria-label="Clear client search" onClick={() => setQ('')} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-stone-100 hover:text-gray-700">×</button>}
      </label>

      <Card className="overflow-hidden">
        {(data?.length ?? 0) === 0 && <div className="px-6 py-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eef4f1] text-xl text-[#42695d]">♙</div><p className="mt-3 font-medium text-gray-700">{q ? 'No matching clients' : 'Your client list is ready'}</p><p className="mt-1 text-sm text-gray-400">{q ? 'Try a different name or phone number.' : 'Clients will appear here after check-in or booking.'}</p></div>}
        {data?.map((c) => (
          <Link
            key={c.id}
            href={`/locations/${params.locationId}/clients/${c.id}`}
            className="group flex items-center gap-4 border-b border-black/5 px-5 py-4 transition-colors last:border-0 hover:bg-[#fafbf8]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#e7f0eb] to-[#f7f0df] text-sm font-semibold text-[#315c4f] ring-1 ring-black/[0.04]">{c.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-[15px] font-semibold text-[#26332e] group-hover:text-[#1f5947]">{c.name}</strong><span className="mt-0.5 block text-xs text-gray-500">{c.phone_display ? formatPhoneInput(c.phone_display) : 'No phone number on file'}</span></span>
            <span className="flex shrink-0 items-center gap-3">{c.allergy_flag && <Pill tone="amber">Allergy note</Pill>}<span aria-hidden="true" className="text-xl text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-[#557c6f]">›</span></span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
