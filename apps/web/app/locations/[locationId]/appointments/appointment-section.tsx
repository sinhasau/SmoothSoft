import Link from 'next/link';
import { Button, Card, Pill } from '../../../../components/ui';

export type Appointment = {
  id: string;
  clientId: string;
  clientName: string;
  startsAt: string;
  status: 'booked' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  source: string;
  staffName: string | null;
  locationStaffId?: string | null;
  primaryService: string;
  serviceNames?: string[];
  serviceIds?: string[];
  queueEntryId?: string | null;
  onFloor?: boolean;
  arrived?: boolean;
};

export function AppointmentSection({
  title,
  rows,
  locationId,
  canCancel,
  pending,
  onCheckIn,
  onCancel,
  onNoShow,
  onReschedule,
}: {
  title: string;
  rows: Appointment[];
  locationId: string;
  canCancel: boolean;
  pending: boolean;
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
  onReschedule: (appointment: Appointment) => void;
}) {
  return <section><h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6558]">{title} <span className="ml-1 text-gray-400">{rows.length}</span></h2><Card className="divide-y divide-black/5 overflow-hidden">{rows.map((appointment) => {
    const active = appointment.status === 'booked' || appointment.status === 'confirmed';
    const pastDue = active && new Date(appointment.startsAt) < new Date() && !appointment.arrived;
    return <div key={appointment.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr_auto] sm:items-center"><div><div className="font-serif text-lg">{new Date(appointment.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>{title !== 'Today' && <div className="text-xs text-gray-400">{new Date(appointment.startsAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>}</div><div><Link className="font-medium text-[#244a40] hover:underline" href={`/locations/${locationId}/clients/${appointment.clientId}`}>{appointment.clientName}</Link><div className="mt-0.5 text-xs text-gray-500">{(appointment.serviceNames?.length ? appointment.serviceNames : [appointment.primaryService]).join(' + ')} · {appointment.staffName ?? 'Any professional'}</div>{appointment.notes && <div className="mt-1 text-xs text-gray-400">{appointment.notes}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2"><Pill tone={appointment.status === 'checked_in' ? 'green' : appointment.status === 'cancelled' || appointment.status === 'no_show' ? 'gray' : 'amber'}>{appointment.status.replace('_', ' ')}</Pill>{active && appointment.onFloor && !appointment.arrived && <Pill tone="gray">On the Floor</Pill>}{active && <Button variant="solid" disabled={pending} onClick={() => onCheckIn(appointment.id)}>{appointment.onFloor ? 'Mark arrived' : 'Check in'}</Button>}{active && !appointment.arrived && <Button disabled={pending} onClick={() => onReschedule(appointment)}>Reschedule</Button>}{active && pastDue && <Button disabled={pending} onClick={() => onNoShow(appointment.id)}>No-show</Button>}{active && canCancel && <Button disabled={pending} onClick={() => onCancel(appointment.id)}>Cancel</Button>}</div></div>;
  })}{rows.length === 0 && <div className="px-4 py-8 text-center"><p className="text-sm text-gray-400">No appointments here.</p><p className="mt-1 text-xs text-gray-400">New online and staff-created bookings will appear automatically.</p></div>}</Card></section>;
}
