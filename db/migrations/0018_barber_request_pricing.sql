-- 0018_barber_request_pricing.sql
-- Owner-configurable pricing when a client requests a specific barber by
-- name instead of "any available": same price always, a per-staff price
-- tier each barber sets for themselves, or one flat request surcharge.

create table location_pricing_policy (
  location_id uuid primary key references locations(id),
  barber_request_mode text not null default 'same'
    check (barber_request_mode in ('same', 'per_staff', 'flat')),
  flat_surcharge_amount numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table location_pricing_policy enable row level security;
create policy location_isolation on location_pricing_policy
  using (location_id = current_setting('app.current_location_id')::uuid);

-- Reached only via a parent-scoped query, same as staff_goals/staff_schedule_days — no direct RLS needed.
alter table location_staff add column price_tier_amount numeric(10,2) not null default 0;

-- Records intent (did the client ask for this person by name) separately
-- from assignment (who actually ends up serving), so a later reassignment
-- doesn't retroactively fabricate or erase a request.
alter table queue_entries add column requested_specific_staff boolean not null default false;
