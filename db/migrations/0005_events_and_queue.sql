-- 0005_events_and_queue.sql
-- The append-only events table is the source of truth (see architecture
-- doc Part 1.3). queue_entries is a materialized, mutable PROJECTION kept
-- as its own table purely for read speed — the live board reads this
-- table directly rather than folding events on every page load; it gets
-- rebuilt/corrected from events if it ever drifts.

-- SCALING NOTE: (location_id, sequence_no) needs a per-location monotonic
-- counter. A naive "max(sequence_no)+1 in application code" race-conditions
-- under concurrent writes to the same location. A single global bigserial
-- (just the `id` column) already gives correct global ordering and is
-- sufficient for undo/replay — but if a STRICT per-location sequence is
-- required (e.g. an external contract expects gapless per-location
-- numbering), generate it server-side via this counter table instead of
-- computing it in application code:
create table location_sequence_counters (
  location_id uuid primary key references locations(id),
  next_value bigint not null default 1
);
-- Usage inside the same transaction as the event insert:
--   update location_sequence_counters
--   set next_value = next_value + 1
--   where location_id = $1
--   returning next_value - 1;
-- This serializes event inserts PER LOCATION (desired — one shop's queue
-- writes shouldn't need to coordinate with another's) without needing
-- 10,000 native Postgres sequences.

create table events (
  id bigserial primary key,
  location_id uuid not null references locations(id),
  sequence_no bigint not null,
  event_type text not null,             -- 'client_checked_in', 'service_started', ...
  entity_id uuid,                       -- the queue_entry/transaction this event acted on
  actor_user_id uuid references users(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  client_id uuid references clients(id),
  service_id uuid references services(id),
  status text not null check (status in ('waiting','in_service','completed','cancelled','no_show')),
  assigned_location_staff_id uuid references location_staff(id),
  is_appt boolean not null default false,
  appt_at timestamptz,
  present boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Baseline FK / uniqueness indexes
create unique index idx_events_location_sequence on events (location_id, sequence_no);
create index idx_queue_entries_location_status on queue_entries (location_id, status);
create index idx_queue_entries_assigned_staff on queue_entries (assigned_location_staff_id);
