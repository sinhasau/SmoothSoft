'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import { Button, Card } from '../../../../../components/ui';

interface ClientProfile {
  client: {
    id: string;
    name: string;
    phone_display: string | null;
    notes: string | null;
    allergy_flag: boolean;
    referral_source: string | null;
  };
  recordedVisits: number;
  recordedSpend: number;
  recordedSpendCaveat: string;
  serviceHistory: { transactionId: string; date: string; serviceName: string; staffName: string | null; price: string; tip: string }[];
}

export default function ClientProfilePage({ params }: { params: { clientId: string } }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['clients', params.clientId],
    queryFn: () => api.get<ClientProfile>(`/clients/${params.clientId}`),
  });
  const [notes, setNotes] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (allergyFlag: boolean) => api.put(`/clients/${params.clientId}`, { notes: notes ?? data?.client.notes, allergyFlag }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients', params.clientId] }),
  });

  if (!data) return <p className="text-gray-500">Loading…</p>;
  const { client } = data;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{client.name}</h2>
            <p className="text-sm text-gray-500">{client.referral_source ? `Referral: ${client.referral_source}` : ''}</p>
          </div>
          {client.allergy_flag && <span className="text-amber-700 text-sm font-medium">⚠ Allergy flag</span>}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <div className="text-gray-500">Phone</div>
            <div>{client.phone_display ?? '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">Recorded visits</div>
            <div>{data.recordedVisits}</div>
          </div>
          <div>
            <div className="text-gray-500">Recorded spend</div>
            <div>${data.recordedSpend.toFixed(2)}</div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">{data.recordedSpendCaveat}</p>

        <div className="mb-3">
          <div className="text-sm text-gray-500 mb-1">Notes</div>
          <textarea
            className="w-full border border-black/15 rounded-lg px-3 py-2"
            defaultValue={client.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="solid" onClick={() => save.mutate(client.allergy_flag)}>
            Save notes
          </Button>
          <Button onClick={() => save.mutate(!client.allergy_flag)}>{client.allergy_flag ? 'Clear allergy flag' : 'Set allergy flag'}</Button>
        </div>
      </Card>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Service history</h3>
        <Card>
          {data.serviceHistory.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No visits recorded yet.</div>}
          {data.serviceHistory.map((h) => (
            <div key={h.transactionId} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <span>{new Date(h.date).toLocaleDateString()}</span>
              <span>{h.serviceName}</span>
              <span className="text-gray-500">{h.staffName}</span>
              <span>
                ${Number(h.price).toFixed(2)} + ${Number(h.tip).toFixed(2)} tip
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
