alter table location_staff add column if not exists hire_date date;

create table if not exists location_payroll_settings (
  location_id uuid primary key references locations(id) on delete cascade,
  period_length_days integer not null default 14 check (period_length_days in (7, 14)),
  anchor_date date not null default current_date,
  payday_offset_days integer not null default 5 check (payday_offset_days between 0 and 14),
  updated_at timestamptz not null default now()
);

alter table location_payroll_settings enable row level security;
drop policy if exists location_isolation on location_payroll_settings;
create policy location_isolation on location_payroll_settings
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);
