-- 0002_staff.sql
-- Users (login identity) + location_staff (many-to-many assignment, the
-- multi-location toggle's actual mechanism) + two tables normalized OUT of
-- the earlier prototype's embedded JSON: schedule.days[] and the
-- commission/booth-rent fields, which needed to become real rows for two
-- different reasons (see comments below).

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table location_staff (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  user_id uuid not null references users(id),
  role text not null check (role in ('org_owner','location_manager','staff','front_desk')),
  classification text check (classification in ('w2','1099')),
  is_primary boolean not null default false,
  permission_overrides jsonb not null default '{}',   -- per-person grants/revocations over role defaults
  status text not null default 'off' check (status in ('available','busy','break','off')),
  created_at timestamptz not null default now(),
  unique (location_id, user_id)   -- one assignment row per (location, user); multiple locations = multiple rows
);

-- NORMALIZATION: the prototype stored schedule as {days:[1,2,3], start, end}
-- inside the staff object. Flattening days into their own table is what
-- makes "who's scheduled Tuesday at 2pm" an indexable query instead of a
-- deserialize-and-scan of every staff member's JSON on every appointment
-- booking attempt.
create table staff_schedule_days (
  id uuid primary key default gen_random_uuid(),
  location_staff_id uuid not null references location_staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0=Sun
  start_time time not null,
  end_time time not null,
  unique (location_staff_id, day_of_week)
);

-- NORMALIZATION: commission_pct / booth_rent_weekly were plain mutable
-- columns in the prototype. That loses history — if a commission rate
-- changes mid-quarter, recalculating a past pay period's earnings against
-- the CURRENT rate is silently wrong, and it's exactly the kind of error
-- an auditor would flag under the classification/payroll risk already
-- identified in the platform PRD. Effective-dated rows fix that.
create table staff_compensation_history (
  id uuid primary key default gen_random_uuid(),
  location_staff_id uuid not null references location_staff(id),
  classification text not null check (classification in ('w2','1099')),
  commission_pct numeric(5,2),
  booth_rent_weekly numeric(10,2),
  effective_from timestamptz not null default now(),
  effective_to timestamptz              -- null = currently in effect
);

create table staff_goals (
  location_staff_id uuid primary key references location_staff(id),
  daily_revenue numeric(10,2),
  clients_per_day int
);

create table location_goals (
  location_id uuid primary key references locations(id),
  daily_revenue_per_barber numeric(10,2),
  clients_per_day_per_barber int,
  tip_rate_pct numeric(5,2),
  utilization_target_pct numeric(5,2)
);

-- Baseline FK indexes
create index idx_location_staff_location_id on location_staff (location_id);
create index idx_location_staff_user_id on location_staff (user_id);        -- "which locations does this person work"
create index idx_staff_schedule_days_staff_id on staff_schedule_days (location_staff_id);
create index idx_staff_comp_history_staff_id on staff_compensation_history (location_staff_id);
