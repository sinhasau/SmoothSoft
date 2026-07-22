create table if not exists shop_openings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  opened_by_user_id uuid references users(id),
  opening_date date not null,
  default_starting_float numeric(10,2) not null,
  actual_starting_float numeric(10,2) not null check (actual_starting_float >= 0),
  variance numeric(10,2) not null,
  tasks_completed text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (location_id, opening_date)
);

create index if not exists idx_shop_openings_location_date on shop_openings (location_id, opening_date);
alter table shop_openings enable row level security;
drop policy if exists location_isolation on shop_openings;
create policy location_isolation on shop_openings
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);
