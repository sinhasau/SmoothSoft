'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import { Card } from '../../../../../components/ui';

interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface StaffDetail {
  locationStaffId: string;
  fullName: string;
  role: string;
  classification: string;
  status: string;
  compensation: { commission_pct: string | null; booth_rent_weekly: string | null } | null;
  goals: { daily_revenue: string | null; clients_per_day: number | null } | null;
  schedule: ScheduleDay[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? ':' + String(m).padStart(2, '0') : ''}${period}`;
}

export default function StaffDetailPage({ params }: { params: { locationId: string; staffId: string } }) {
  const { data: roster } = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffDetail[]>('/settings/staff') });
  const person = roster?.find((r) => r.locationStaffId === params.staffId);

  if (!roster) return <p className="text-gray-500">Loading…</p>;
  if (!person) return <p className="text-gray-500">Staff member not found.</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{person.fullName}</h2>
            <p className="text-sm text-gray-500">
              {person.role.replace('_', ' ')} · {person.classification.toUpperCase()}
            </p>
          </div>
          <span className={person.status === 'off' ? 'text-gray-400' : 'text-green-700'}>{person.status === 'off' ? 'Off today' : person.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Compensation</div>
            <div>
              {person.compensation?.commission_pct
                ? `${person.compensation.commission_pct}% commission`
                : person.compensation?.booth_rent_weekly
                  ? `$${person.compensation.booth_rent_weekly}/wk booth rent`
                  : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Goals</div>
            <div>
              {person.goals?.daily_revenue ? `$${person.goals.daily_revenue}/day` : '—'}
              {person.goals?.clients_per_day ? ` · ${person.goals.clients_per_day} clients/day` : ''}
            </div>
          </div>
        </div>
      </Card>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Weekly schedule</h3>
        <Card>
          {DAY_LABELS.map((label, dow) => {
            const shift = person.schedule.find((s) => s.day_of_week === dow);
            return (
              <div key={dow} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-2 text-sm">
                <span>{label}</span>
                {shift ? (
                  <span>
                    {fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}
                  </span>
                ) : (
                  <span className="text-gray-300">off</span>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
