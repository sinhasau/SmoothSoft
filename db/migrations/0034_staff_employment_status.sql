alter table location_staff add column if not exists employment_status text not null default 'active';
alter table location_staff
  drop constraint if exists location_staff_employment_status_check,
  add constraint location_staff_employment_status_check check (employment_status in ('active', 'inactive', 'resigned'));
