-- 0017_report_favorites.sql
-- Per-person favorited reports on the new Reports tab. Keyed on
-- location_staff_id (not user_id), matching every other per-person config
-- table (staff_goals, staff_schedule_days, staff_compensation_history) —
-- reached only via the location_staff FK, same as those tables, so no
-- direct RLS policy is needed (see the "reached only via a parent FK" note
-- in 0008_row_level_security.sql).

create table report_favorites (
  location_staff_id uuid not null references location_staff(id) on delete cascade,
  report_id text not null,
  created_at timestamptz not null default now(),
  primary key (location_staff_id, report_id)
);
