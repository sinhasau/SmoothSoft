-- 0015_scheduling_policy.sql
-- Owner-dashboard Settings tab: a location-wide default for whether staff
-- schedule requests need manager approval or can be set directly, plus a
-- per-staff exception that flips the effective policy for that individual
-- (critique item 27). Additive on top of 0001-0014.

create table location_scheduling_policy (
  location_id uuid primary key references locations(id),
  self_serve_default boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table location_scheduling_policy enable row level security;
create policy location_isolation on location_scheduling_policy
  using (location_id = current_setting('app.current_location_id')::uuid);

-- null = use the location default; true/false = explicit per-person
-- override of it, per the "per-staff exception checkboxes" requirement.
alter table location_staff
  add column scheduling_self_serve_override boolean;
