alter table staff_compensation_history
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists annual_salary numeric(12,2),
  add column if not exists custom_pay_model_id uuid,
  add column if not exists custom_pay_model_name text;

create table if not exists location_pay_models (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  calculation_type text not null check (calculation_type in ('commission','booth_rent','hourly','salary')),
  default_amount numeric(12,2) not null check (default_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create table if not exists location_job_roles (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  permission_role text not null check (permission_role in ('location_manager','staff','front_desk')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

alter table staff_compensation_history
  add constraint staff_comp_custom_model_fk foreign key (custom_pay_model_id) references location_pay_models(id) on delete set null,
  add constraint staff_comp_hourly_nonnegative check (hourly_rate is null or hourly_rate >= 0),
  add constraint staff_comp_salary_nonnegative check (annual_salary is null or annual_salary >= 0),
  add constraint staff_comp_single_model check (num_nonnulls(commission_pct, booth_rent_weekly, hourly_rate, annual_salary) <= 1);

alter table location_staff add column if not exists job_role_id uuid references location_job_roles(id) on delete set null;

alter table location_pay_models enable row level security;
alter table location_job_roles enable row level security;
create policy location_isolation on location_pay_models using (location_id = current_setting('app.current_location_id')::uuid) with check (location_id = current_setting('app.current_location_id')::uuid);
create policy location_isolation on location_job_roles using (location_id = current_setting('app.current_location_id')::uuid) with check (location_id = current_setting('app.current_location_id')::uuid);
