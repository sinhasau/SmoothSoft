'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { formatPhoneInput } from '../../../../lib/phone';
import { Button } from '../../../../components/ui';
import { ProfessionalPicker, type ProfessionalOption } from '../../../../components/professional-picker';
import { ServiceMultiPicker, type MultiServiceOption } from '../../../../components/service-multi-picker';
import type { Appointment } from './appointment-section';

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function splitStartsAt(startsAt: string) {
  const d = new Date(startsAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function RescheduleAppointmentModal({ appointment, onClose, onDone }: { appointment: Appointment; onClose: () => void; onDone: () => void }) {
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<MultiServiceOption[]>('/settings/services') });
  const staff = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<ProfessionalOption[]>('/settings/staff') });
  const initial = splitStartsAt(appointment.startsAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [staffId, setStaffId] = useState(appointment.locationStaffId ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(appointment.serviceIds?.length ? appointment.serviceIds : []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.patch(`/appointments/${appointment.id}`, {
      startsAt: new Date(`${date}T${time}:00`).toISOString(),
      locationStaffId: staffId || undefined,
      serviceIds: serviceIds.length ? serviceIds : undefined,
    }),
    onSuccess: () => { onDone(); onClose(); },
    onError: (err) => setError(err instanceof ApiError ? (err.body?.message ?? 'Could not update this appointment') : 'Could not update this appointment'),
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-1 font-semibold">Reschedule — {appointment.clientName}</h3>
      <p className="mb-4 text-sm text-gray-500">Change the time, professional, or services on this booking.</p>
      <div className="mb-3 flex gap-2">
        <input type="date" className="flex-1 rounded-lg border border-black/15 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" className="flex-1 rounded-lg border border-black/15 px-3 py-2" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {services.data && <div className="mb-2"><ServiceMultiPicker services={services.data} selectedIds={serviceIds} onChange={setServiceIds} /></div>}
      {staff.data && <ProfessionalPicker options={staff.data} selected={staffId} isAppointment onSelect={setStaffId} />}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => save.mutate()} disabled={!staffId || !serviceIds.length || save.isPending}>Save</Button>
      </div>
    </Modal>
  );
}

export function NewAppointmentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<MultiServiceOption[]>('/settings/services') });
  const staff = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<ProfessionalOption[]>('/settings/staff') });
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const [phone, setPhone] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [needsNewClientName, setNeedsNewClientName] = useState(false);
  const [date, setDate] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  const [time, setTime] = useState('10:00');
  const [staffId, setStaffId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceIds.length && services.data?.length) setServiceIds([(services.data.find((s) => s.is_default) ?? services.data[0]).id]);
  }, [services.data, serviceIds.length]);

  const create = useMutation({
    mutationFn: () => api.post('/appointments', {
      phone,
      newClientName: needsNewClientName ? newClientName : undefined,
      serviceId: serviceIds[0],
      serviceIds,
      locationStaffId: staffId,
      startsAt: new Date(`${date}T${time}:00`).toISOString(),
    }),
    onSuccess: () => { onDone(); onClose(); },
    onError: (err) => {
      if (err instanceof ApiError && err.body?.code === 'NEW_CLIENT_NAME_REQUIRED') {
        setNeedsNewClientName(true);
        setError(null);
      } else if (err instanceof ApiError) {
        setError(err.body?.message ?? 'Could not create this appointment');
      }
    },
  });

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-4 font-semibold">New appointment</h3>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className="mb-3 w-full rounded-lg border border-black/15 px-3 py-2"
        placeholder="313-555-1212"
        value={phone}
        onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
      />
      {needsNewClientName && (
        <div className="mb-3">
          <p className="mb-1 text-sm text-amber-700">This number isn't on file — enter a name to create a profile.</p>
          <input className="w-full rounded-lg border border-black/15 px-3 py-2" placeholder="Client name" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
        </div>
      )}
      <div className="mb-3 flex gap-2">
        <input type="date" className="flex-1 rounded-lg border border-black/15 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" className="flex-1 rounded-lg border border-black/15 px-3 py-2" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {services.data && <div className="mb-2"><ServiceMultiPicker services={services.data} selectedIds={serviceIds} onChange={setServiceIds} /></div>}
      {staff.data && <ProfessionalPicker options={staff.data} selected={staffId} isAppointment onSelect={setStaffId} />}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={() => create.mutate()} disabled={!phone || !staffId || !serviceIds.length || create.isPending}>Book</Button>
      </div>
    </Modal>
  );
}
