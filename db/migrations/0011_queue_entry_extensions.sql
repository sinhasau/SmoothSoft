-- 0011_queue_entry_extensions.sql
-- Additive columns needed for confirmed product decisions
-- (HANDOFF-master.md "Confirmed decisions — do not relitigate") that
-- 0005_events_and_queue.sql's queue_entries didn't yet have columns for:
--
-- - "Here" checkbox stores BOTH presentCheckedAt (actual time) and
--   presentProjectedAt (their queue estimate at that moment) as raw data
--   for a future wait-time-accuracy analysis.
-- - Abandoned (checked in, never served) is tracked separately from
--   no-show (never checked in) — queue_entries.status alone (0005) can't
--   distinguish these since both would otherwise just be 'cancelled'.
-- - Drag-to-reorder needs a persisted manual order; original_waiting_order
--   backs "return to original position" (Live Queue PRD §5.2).
-- - Start's service note (this visit only) needs somewhere to live per
--   entry; the PERSISTENT per-client general note already has a home on
--   clients.notes (0003_clients_identity.sql) and doesn't need its own
--   column here.

alter table queue_entries
  add column present_checked_at timestamptz,
  add column present_projected_at timestamptz,
  add column abandoned boolean not null default false,
  add column waiting_order integer,
  add column original_waiting_order integer,
  add column service_notes text;

-- Links a completed queue entry to the transaction its checkout produced —
-- needed so Reports/Dashboard can join "who was served" to "what they paid",
-- and so undo-of-complete can find the transaction to void.
alter table transactions
  add column queue_entry_id uuid references queue_entries(id);

create index idx_queue_entries_waiting_order on queue_entries (location_id, waiting_order) where status = 'waiting';
create index idx_transactions_queue_entry on transactions (queue_entry_id);
