-- 0012_queue_guest_name.sql
-- Found while smoke-testing the Queue module's check-in flow: a guest
-- walk-in (no phone, no client record — PRD-live-queue-checkin.md §5.4
-- "phone or guest tab") had nowhere to store its display name.
-- queue_entries.client_id is nullable for exactly this case, but nothing
-- captured the name itself.

alter table queue_entries
  add column guest_name text;
