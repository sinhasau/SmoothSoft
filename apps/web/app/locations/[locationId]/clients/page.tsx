'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { Card } from '../../../../components/ui';

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
  });

  return (
    <div className="space-y-4">
      <input
        className="w-full max-w-sm border border-black/15 rounded-lg px-3 py-2"
        placeholder="Search by name or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Card>
        {(data?.length ?? 0) === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No clients found.</div>}
        {data?.map((c) => (
          <Link
            key={c.id}
            href={`/locations/${params.locationId}/clients/${c.id}`}
            className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3 hover:bg-black/[0.02]"
          >
            <span className="font-medium underline decoration-gray-300 underline-offset-2">{c.name}</span>
            <span className="text-sm text-gray-500 flex items-center gap-2">
              {c.allergy_flag && <span className="text-amber-700">allergy flag</span>}
              {c.phone_display}
            </span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
