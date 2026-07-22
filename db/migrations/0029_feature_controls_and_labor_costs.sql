create table if not exists location_feature_settings (
  location_id uuid primary key references locations(id) on delete cascade,
  retail_products_enabled boolean not null default true,
  discount_codes_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table location_feature_settings enable row level security;
drop policy if exists location_isolation on location_feature_settings;
create policy location_isolation on location_feature_settings
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);

alter table location_scheduling_policy
  add column if not exists base_hourly_labor_cost numeric(10,2) not null default 24,
  add column if not exists payroll_burden_pct numeric(5,2) not null default 0;

alter table location_scheduling_policy
  drop constraint if exists location_scheduling_policy_labor_cost_check,
  add constraint location_scheduling_policy_labor_cost_check check (base_hourly_labor_cost >= 0 and base_hourly_labor_cost <= 1000),
  drop constraint if exists location_scheduling_policy_payroll_burden_check,
  add constraint location_scheduling_policy_payroll_burden_check check (payroll_burden_pct >= 0 and payroll_burden_pct <= 100);
