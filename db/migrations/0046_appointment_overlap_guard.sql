-- 0046_appointment_overlap_guard.sql
-- Database-level backstop against double-booking a professional. BookingService and
-- AppointmentsService already serialize same-staff/day attempts with a pg_advisory_xact_lock
-- plus an overlap recheck; this constraint is defense in depth so no future code path can create
-- an overlapping appointment even if it forgets the lock. It needs a stored end time because an
-- appointment's duration is the sum of its appointment_services rows — not expressible as a
-- simple generated column — so the application maintains ends_at on insert and reschedule.

create extension if not exists btree_gist;

alter table appointments add column if not exists ends_at timestamptz;

-- Backfill existing rows: end = start + total service duration, falling back to the primary
-- service's duration if a row has no appointment_services lines.
update appointments a
set ends_at = a.starts_at + (
  coalesce(
    (select sum(s.duration_minutes) from appointment_services aps join services s on s.id = aps.service_id where aps.appointment_id = a.id),
    (select s.duration_minutes from services s where s.id = a.service_id),
    0
  ) * interval '1 minute'
)
where ends_at is null;

-- Only active, staff-assigned appointments with a known end participate. tstzrange defaults to
-- '[)' bounds, so an appointment ending exactly when the next begins does NOT count as an overlap.
-- Cancelled/no-show/completed rows and any legacy row without a computable end are excluded, so
-- the constraint can never reject historical data.
alter table appointments
  add constraint appointments_no_staff_overlap
  exclude using gist (
    location_staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (status in ('booked', 'confirmed') and location_staff_id is not null and ends_at is not null);
