-- 0009_scheduling_and_compliance.sql
-- Additive on top of 0001-0008 (does not alter any prior migration).
--
-- staff_schedule_days (0002) is the RECURRING weekly pattern. The confirmed
-- product decision is that date-specific coverage changes are the default
-- and recurring changes require two explicit clicks with a warning (see
-- HANDOFF-master.md "Confirmed decisions"). That needs a one-off exception
-- table separate from the recurring pattern, plus a request/approval table
-- for the pending-requests panel shown in the Schedule tab reference UI.
--
-- compliance_documents backs the license/insurance-expiry alerts shown on
-- the Dashboard and Owner Dashboard reference screenshots (Module 13,
-- not yet modeled anywhere in 0001-0008).

-- A one-off override for a single date, replacing (not modifying) whatever
-- the recurring staff_schedule_days pattern would otherwise produce for
-- that specific staff member on that specific date.
create table schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  location_staff_id uuid not null references location_staff(id) on delete cascade,
  location_id uuid not null references locations(id),
  work_date date not null,
  is_working boolean not null,          -- false = off that day, true = working (see start/end)
  start_time time,                      -- null when is_working = false
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  unique (location_staff_id, work_date)
);

-- A staff-submitted request that hasn't been applied yet. One-off requests
-- approve in a single click; recurring requests require the UI's two-click
-- confirm (see queue_config-style Settings toggle in the Schedule module) --
-- that's a frontend/API behavior, not a schema constraint, but request_type
-- is what the approval flow branches on.
create table schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  location_staff_id uuid not null references location_staff(id) on delete cascade,
  location_id uuid not null references locations(id),
  request_type text not null check (request_type in ('one_time', 'recurring')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'withdrawn')),
  work_date date,                        -- set for one_time requests
  day_of_week smallint check (day_of_week between 0 and 6),  -- set for recurring requests
  is_working boolean not null,
  start_time time,
  end_time time,
  reason text,
  requested_by_user_id uuid references users(id),
  decided_by_user_id uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- License/insurance/sanitation-log style compliance tracking (Module 13),
-- generalized to any staff- or location-scoped document with an expiry.
create table compliance_documents (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  location_staff_id uuid references location_staff(id),   -- null = location-level (e.g. sanitation log), not staff-level
  doc_type text not null,               -- 'insurance_certificate' | 'sanitation_log' | 'business_license' | ...
  description text,
  expires_at date,
  last_updated_at timestamptz not null default now(),
  status text not null default 'valid' check (status in ('valid', 'needs_attention', 'overdue')),
  created_at timestamptz not null default now()
);

create index idx_schedule_exceptions_staff_date on schedule_exceptions (location_staff_id, work_date);
create index idx_schedule_exceptions_location_date on schedule_exceptions (location_id, work_date);
create index idx_schedule_change_requests_location_status on schedule_change_requests (location_id, status);
create index idx_compliance_documents_location on compliance_documents (location_id);
create index idx_compliance_documents_expires on compliance_documents (expires_at);

alter table schedule_exceptions enable row level security;
create policy location_isolation on schedule_exceptions
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table schedule_change_requests enable row level security;
create policy location_isolation on schedule_change_requests
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table compliance_documents enable row level security;
create policy location_isolation on compliance_documents
  using (location_id = current_setting('app.current_location_id')::uuid);
