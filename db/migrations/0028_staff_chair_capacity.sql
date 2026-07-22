alter table location_staff
  add column if not exists uses_service_chair boolean not null default true;
