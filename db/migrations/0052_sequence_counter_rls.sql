-- 0052_sequence_counter_rls.sql
-- Closes the one tenant-scoped table that never got a Row-Level Security
-- policy. Found by the new coverage test in
-- apps/api/src/db/rls-isolation.test.ts, which asserts that every table
-- carrying location_id or organization_id is actually protected — rather
-- than trusting that whoever added the table remembered.
--
-- Why it matters despite looking like bookkeeping: salon_app holds
-- SELECT/UPDATE on every table (db/grant-app-role.sql), so without a policy
-- one location's request could read another location's event volume, and a
-- bug in a where-clause could bump another location's sequence counter —
-- which would silently corrupt the ordering of that shop's append-only event
-- log, the source of truth for its whole queue.
--
-- Safe to add: appendEvent() (apps/api/src/queue/event-log.ts) only ever
-- touches this table inside the request's RLS transaction, already filtered
-- to its own location_id. Seeds connect as the table-owning role, for which
-- RLS is bypassed, so they are unaffected.
--
-- Same shape as every other location-scoped policy in 0008. Omitting
-- WITH CHECK is deliberate and consistent: Postgres then reuses the USING
-- expression for INSERT, so a row can only be added for the scoped location.

alter table location_sequence_counters enable row level security;

drop policy if exists location_isolation on location_sequence_counters;
create policy location_isolation on location_sequence_counters
  using (location_id = current_setting('app.current_location_id')::uuid);
