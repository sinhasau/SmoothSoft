'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { useRequireAuth } from '../../../../lib/auth';
import { Button } from '../../../../components/ui';
import { AppointmentSection, type Appointment } from './appointment-section';
import { NewAppointmentModal, RescheduleAppointmentModal } from './appointment-modals';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function AppointmentsPage({ params }: { params: { locationId: string } }) {
  const auth = useRequireAuth();
  const queryClient = useQueryClient();
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const appointments = useQuery({ queryKey: ['appointments'], queryFn: () => api.get<Appointment[]>('/appointments') });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  const checkIn = useMutation({ mutationFn: (id: string) => api.post(`/appointments/${id}/check-in`), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/appointments/${id}/cancel`), onSuccess: refresh });
  const noShow = useMutation({ mutationFn: (id: string) => api.post(`/appointments/${id}/no-show`), onSuccess: refresh });
  const canCancel = auth?.role === 'org_owner' || auth?.role === 'location_manager' || auth?.role === 'front_desk';
  const now = new Date();
  const rows = appointments.data ?? [];
  const today = rows.filter((appointment) => sameDay(new Date(appointment.startsAt), now));
  const upcoming = rows.filter((appointment) => new Date(appointment.startsAt) > now && !sameDay(new Date(appointment.startsAt), now));
  const pending = checkIn.isPending || cancel.isPending || noShow.isPending;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfd9cd] pb-4">
      <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Plan the welcome</p><h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Appointments</h1><p className="mt-1 text-sm text-gray-500">Review bookings, reschedule, and move arrived clients directly onto the Floor.</p></div>
      <div className="flex items-center gap-2">
        <Button variant="solid" onClick={() => setCreating(true)}>+ New appointment</Button>
        <Link href={`/locations/${params.locationId}/queue`} className="rounded-xl bg-[#315c4f] px-4 py-2 text-sm font-medium text-white shadow-sm">Book from Floor</Link>
      </div>
    </header>
    <AppointmentSection
      title="Today"
      rows={today}
      locationId={params.locationId}
      canCancel={canCancel}
      pending={pending}
      onCheckIn={(id) => checkIn.mutate(id)}
      onCancel={(id) => { if (window.confirm('Cancel this appointment? The booking will remain in the client history.')) cancel.mutate(id); }}
      onNoShow={(id) => { if (window.confirm('Mark this appointment as a no-show?')) noShow.mutate(id); }}
      onReschedule={(appointment) => setRescheduling(appointment)}
    />
    <AppointmentSection
      title="Coming up"
      rows={upcoming}
      locationId={params.locationId}
      canCancel={canCancel}
      pending={pending}
      onCheckIn={(id) => checkIn.mutate(id)}
      onCancel={(id) => { if (window.confirm('Cancel this appointment? The booking will remain in the client history.')) cancel.mutate(id); }}
      onNoShow={(id) => { if (window.confirm('Mark this appointment as a no-show?')) noShow.mutate(id); }}
      onReschedule={(appointment) => setRescheduling(appointment)}
    />
    {rescheduling && <RescheduleAppointmentModal appointment={rescheduling} onClose={() => setRescheduling(null)} onDone={refresh} />}
    {creating && <NewAppointmentModal onClose={() => setCreating(false)} onDone={refresh} />}
  </div>;
}
