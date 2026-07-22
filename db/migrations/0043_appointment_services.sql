create table if not exists appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  service_id uuid not null references services(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (appointment_id, service_id)
);

create index if not exists idx_appointment_services_appointment
  on appointment_services (appointment_id, sort_order);

insert into appointment_services (appointment_id, service_id, sort_order)
select id, service_id, 0 from appointments
on conflict (appointment_id, service_id) do nothing;

alter table appointment_services enable row level security;
drop policy if exists location_isolation on appointment_services;
create policy location_isolation on appointment_services
  using (exists (
    select 1 from appointments a
    where a.id = appointment_services.appointment_id
      and a.location_id = current_setting('app.current_location_id')::uuid
  ));
