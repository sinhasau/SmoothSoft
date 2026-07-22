alter table location_scheduling_policy
  add column if not exists chair_count integer not null default 4;

alter table location_scheduling_policy
  drop constraint if exists location_scheduling_policy_chair_count_check,
  add constraint location_scheduling_policy_chair_count_check check (chair_count > 0 and chair_count <= 500);

create table if not exists location_communication_settings (
  location_id uuid primary key references locations(id),
  enabled boolean not null default true,
  booking_confirmations boolean not null default true,
  appointment_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table location_communication_settings enable row level security;
drop policy if exists location_isolation on location_communication_settings;
create policy location_isolation on location_communication_settings
  using (location_id = current_setting('app.current_location_id')::uuid);
