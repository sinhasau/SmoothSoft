-- 0045_queue_entry_identity_note.sql
-- Short free-text note to tell apart two waiting clients who share a display
-- name (e.g. "blue jacket") — captured when marking a duplicate-name entry
-- arrived, shown next to their name on the Floor.

alter table queue_entries add column if not exists identity_note text;
