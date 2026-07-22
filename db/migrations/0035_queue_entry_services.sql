-- A visit may include several services. queue_entries.service_id remains the
-- primary service for backwards compatibility with existing reports.
create table if not exists queue_entry_services (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  queue_entry_id uuid not null references queue_entries(id) on delete cascade,
  service_id uuid not null references services(id),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (queue_entry_id, service_id)
);

create index if not exists idx_queue_entry_services_entry
  on queue_entry_services(queue_entry_id, sort_order);

insert into queue_entry_services (location_id, queue_entry_id, service_id, sort_order)
select location_id, id, service_id, 0
from queue_entries
where service_id is not null
on conflict (queue_entry_id, service_id) do nothing;

alter table queue_entry_services enable row level security;
drop policy if exists location_isolation on queue_entry_services;
create policy location_isolation on queue_entry_services
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);
