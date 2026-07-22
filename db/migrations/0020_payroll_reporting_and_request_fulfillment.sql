-- Preserve the original named-barber request independently of later assignment.
alter table queue_entries
  add column if not exists requested_location_staff_id uuid references location_staff(id);

update queue_entries
set requested_location_staff_id = assigned_location_staff_id
where requested_specific_staff = true;

create index if not exists idx_queue_entries_requested_staff
  on queue_entries (requested_location_staff_id)
  where requested_location_staff_id is not null;

-- Immutable payroll-review snapshots. These are management records, not a tax
-- engine: calculated values and source assumptions are stored as JSON so a
-- historical review never changes when compensation settings change later.
create table if not exists staff_pay_runs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  period_start date not null,
  period_end date not null,
  status text not null default 'logged' check (status in ('logged', 'paid')),
  notes text,
  snapshot jsonb not null,
  logged_by_user_id uuid references users(id),
  logged_at timestamptz not null default now(),
  paid_at timestamptz,
  check (period_end >= period_start)
);

create index if not exists idx_staff_pay_runs_location_period
  on staff_pay_runs (location_id, period_start desc, period_end desc);

create table if not exists report_exports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  report_id text not null,
  format text not null check (format in ('pdf', 'xlsx')),
  period_start date,
  period_end date,
  exported_by_user_id uuid references users(id),
  exported_at timestamptz not null default now(),
  parameters jsonb not null default '{}'
);

create index if not exists idx_report_exports_location_date
  on report_exports (location_id, exported_at desc);

alter table staff_pay_runs enable row level security;
drop policy if exists staff_pay_runs_location_isolation on staff_pay_runs;
create policy staff_pay_runs_location_isolation on staff_pay_runs
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table report_exports enable row level security;
drop policy if exists report_exports_location_isolation on report_exports;
create policy report_exports_location_isolation on report_exports
  using (location_id = current_setting('app.current_location_id')::uuid);
