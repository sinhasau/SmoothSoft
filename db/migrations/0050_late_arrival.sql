-- 0050_late_arrival.sql
-- "Late arrival": a waiting client who showed up (or was found) well past their
-- estimated start, where staff have decided they should keep their place in
-- line but no longer distort the wait-time estimate for everyone behind them.
--
-- Deliberately a separate flag rather than a queue_entries.status value: the
-- entry is still genuinely `waiting` — it can be started, reassigned,
-- cancelled, and no-showed exactly like any other — so folding this into the
-- status enum would force every status check in the app to special-case it.
-- It is also not ready_override, which drives staff *recommendations*; this
-- drives the *estimate*, and the two need to move independently (a late
-- arrival can still be the right person to seat next).

alter table queue_entries
  add column if not exists late_arrival boolean not null default false;

-- Only ever read alongside the waiting board, which is already filtered by
-- (location_id, status) — see idx_queue_entries_location_status — so this
-- needs no index of its own.

comment on column queue_entries.late_arrival is
  'Waiting client held out of the wait-time estimate after arriving past their estimate; staff seat them manually when an opening appears.';
