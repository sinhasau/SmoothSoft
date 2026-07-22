create table if not exists location_special_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  special_date date not null,
  label text,
  is_closed boolean not null default true,
  open_time time,
  close_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, special_date),
  check (is_closed or (open_time is not null and close_time is not null and open_time < close_time))
);

create index if not exists idx_location_special_hours_date on location_special_hours(location_id, special_date);
alter table location_special_hours enable row level security;
drop policy if exists location_isolation on location_special_hours;
create policy location_isolation on location_special_hours
  using (location_id = current_setting('app.current_location_id')::uuid);
