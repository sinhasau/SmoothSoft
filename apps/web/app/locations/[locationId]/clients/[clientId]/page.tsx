'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import { Button, Card } from '../../../../../components/ui';
import { ServiceMultiPicker } from '../../../../../components/service-multi-picker';

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
  servicePace: { medianMinutes: number | null; timedVisitCount: number; factor: number | null; minimumVisitsForFactor: number };
  serviceHistory: { transactionId: string; date: string; serviceName: string; staffName: string | null; price: string; tip: string }[];
  upcomingAppointments: { id: string; startsAt: string; status: string; notes: string | null; serviceName: string; staffName: string | null }[];
  consents: { id: string; consentType: string; version: string; accepted: boolean; capturedAt: string; notes: string | null }[];
}
interface Service { id: string; name: string; duration_minutes: number; price: string; is_default: boolean }
interface StaffChoice { locationStaffId: string; fullName: string; employmentStatus: string }

export default function ClientProfilePage({ params }: { params: { locationId: string; clientId: string } }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['clients', params.clientId],
    queryFn: () => api.get<ClientProfile>(`/clients/${params.clientId}`),
  });
  const [notes, setNotes] = useState<string | null>(null);
  const [rebookOpen, setRebookOpen] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [locationStaffId, setLocationStaffId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const roster = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffChoice[]>('/settings/staff') });
  const defaultService = services.data?.find((s) => s.is_default) ?? services.data?.[0];
  const effectiveServiceIds = serviceIds.length ? serviceIds : defaultService ? [defaultService.id] : [];

  const save = useMutation({
    mutationFn: (allergyFlag: boolean) => api.put(`/clients/${params.clientId}`, { notes: notes ?? data?.client.notes, allergyFlag }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients', params.clientId] }),
  });
  const rebook = useMutation({ mutationFn: () => api.post(`/clients/${params.clientId}/rebook`, { serviceId: effectiveServiceIds[0], serviceIds: effectiveServiceIds, locationStaffId: locationStaffId || null, startsAt: new Date(startsAt).toISOString() }), onSuccess: () => { setRebookOpen(false); setStartsAt(''); setServiceIds([]); setLocationStaffId(''); void queryClient.invalidateQueries({ queryKey: ['clients', params.clientId] }); } });
  const consent = useMutation({ mutationFn: () => api.post(`/clients/${params.clientId}/consents`, { consentType: 'service_and_communication', version: 'pilot-1', accepted: true }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients', params.clientId] }) });
  const cancelAppointment = useMutation({ mutationFn: (appointmentId: string) => api.post(`/clients/${params.clientId}/appointments/${appointmentId}/cancel`, {}), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients', params.clientId] }) });

  if (!data) return <p className="text-gray-500">Loading…</p>;
  const { client } = data;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">{client.name}</h1>
            <p className="text-sm text-gray-500">{client.referral_source ? `Referral: ${client.referral_source}` : ''}</p>
          </div>
          {client.allergy_flag && <span className="text-amber-700 text-sm font-medium">⚠ Allergy flag</span>}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm sm:grid-cols-4">
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
          <div>
            <div className="text-gray-500">Typical service time</div>
            <div>
              {data.servicePace?.medianMinutes != null ? `${data.servicePace.medianMinutes} min` : '—'}
              {data.servicePace?.factor != null && (
                <span className="ml-1.5 text-xs text-[#8b6f47]">
                  {data.servicePace.factor > 1 ? `${Math.round((data.servicePace.factor - 1) * 100)}% longer than usual` : `${Math.round((1 - data.servicePace.factor) * 100)}% quicker than usual`}
                </span>
              )}
            </div>
          </div>
        </div>
        {data.servicePace && data.servicePace.timedVisitCount > 0 && data.servicePace.factor == null && (
          <p className="mb-2 text-xs text-gray-400">
            Median of {data.servicePace.timedVisitCount} timed {data.servicePace.timedVisitCount === 1 ? 'visit' : 'visits'} — {data.servicePace.minimumVisitsForFactor} are needed before this adjusts their wait estimate.
          </p>
        )}
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
          <Button onClick={() => setRebookOpen((value) => !value)}>Rebook</Button>
        </div>
        {rebookOpen && <div className="mt-4 rounded-xl border border-black/10 bg-stone-50 p-4"><h2 className="mb-3 font-semibold">Book the next visit</h2>{services.data && <ServiceMultiPicker services={services.data} selectedIds={effectiveServiceIds} onChange={setServiceIds} helperText="Include every expected service so the calendar reserves the complete visit." />}<div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-gray-600">Professional<select aria-label="Rebook professional" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal" value={locationStaffId} onChange={(event) => setLocationStaffId(event.target.value)}><option value="">Any professional</option>{roster.data?.filter((person) => person.employmentStatus === 'active').map((person) => <option key={person.locationStaffId} value={person.locationStaffId}>{person.fullName}</option>)}</select></label><label className="text-xs font-semibold text-gray-600">Date and time<input className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label></div><div className="mt-3 flex justify-end gap-2"><Button onClick={() => setRebookOpen(false)}>Cancel</Button><Button variant="solid" disabled={!effectiveServiceIds.length || !startsAt || rebook.isPending} onClick={() => rebook.mutate()}>Book appointment</Button></div>{rebook.isError && <p className="mt-2 text-sm text-red-600">Could not book that time. Check the details and try again.</p>}</div>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Upcoming visits</h2><p className="text-xs text-gray-500">Future appointments for this client.</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{data.upcomingAppointments.length}</span></div><div className="mt-3 space-y-2">{data.upcomingAppointments.length === 0 ? <p className="text-sm text-gray-400">No upcoming appointment.</p> : data.upcomingAppointments.map((appointment) => <div key={appointment.id} className="rounded-lg border border-black/10 p-3 text-sm"><div className="flex items-start justify-between gap-3"><div><strong className="block">{appointment.serviceName}</strong><span className="text-gray-500">{new Date(appointment.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{appointment.staffName ? ` · ${appointment.staffName}` : ' · Any professional'}</span></div><button className="shrink-0 text-xs font-medium text-red-600 hover:underline" disabled={cancelAppointment.isPending} onClick={() => { if (window.confirm('Cancel this appointment?')) cancelAppointment.mutate(appointment.id); }}>Cancel</button></div></div>)}</div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Consent</h2><p className="text-xs text-gray-500">Records acceptance of your current service and communication terms.</p></div>{data.consents.some((item) => item.accepted) ? <span className="text-xs font-semibold text-green-700">✓ On file</span> : <Button onClick={() => consent.mutate()} disabled={consent.isPending}>Capture consent</Button>}</div>{data.consents[0] && <p className="mt-3 text-sm text-gray-500">Version {data.consents[0].version} · {new Date(data.consents[0].capturedAt).toLocaleDateString()}</p>}</Card>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Service history</h3>
        <Card className="overflow-x-auto">
          {data.serviceHistory.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">No visits recorded yet.</div>}
          {data.serviceHistory.length > 0 && (
            <table className="w-full min-w-[620px] table-fixed text-left text-sm">
              <caption className="sr-only">Client service history</caption>
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[31%]" />
                <col className="w-[23%]" />
                <col className="w-[28%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-black/[0.07] bg-[#faf8f2]/80 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  <th scope="col" className="px-4 py-2.5">Date</th>
                  <th scope="col" className="px-3 py-2.5">Service</th>
                  <th scope="col" className="px-3 py-2.5">Professional</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Payment</th>
                </tr>
              </thead>
              <tbody>
                {data.serviceHistory.map((h) => (
                  <tr key={h.transactionId} className="border-b border-black/5 last:border-0 hover:bg-[#faf8f2]/60">
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600">{new Date(h.date).toLocaleDateString()}</td>
                    <td className="px-3 py-3.5 font-medium text-gray-900">{h.serviceName}</td>
                    <td className="px-3 py-3.5 text-gray-500">{h.staffName ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-gray-700">
                      <span className="font-medium text-gray-900">${Number(h.price).toFixed(2)}</span>
                      <span className="ml-1 text-xs text-gray-400">+ ${Number(h.tip).toFixed(2)} tip</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
