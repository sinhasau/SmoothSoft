-- 0044_appointment_queue_link.sql
-- Links an auto-materialized (or check-in-created) queue_entries row back to
-- the appointments-table booking it came from, so the Appointments tab and
-- the Floor board can stay in sync (reschedule/cancel/no-show propagation,
-- "already on the Floor" status).

alter table queue_entries add column if not exists appointment_id uuid references appointments(id);
create index if not exists idx_queue_entries_appointment on queue_entries(appointment_id) where appointment_id is not null;
