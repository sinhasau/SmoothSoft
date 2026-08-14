-- Organization-level defaults for operating policy.
--
-- ARCHITECTURE-data-and-perspectives.md lists "org-level settings" among the
-- Owner's primary screens, but every settings table in this schema is keyed by
-- location_id — there was nowhere for an organization-wide default to live, so
-- an owner with three shops had to open three settings pages and keep them in
-- sync by hand.
--
-- Deliberately NOT an inheritance table. Locations keep their own rows and
-- every read path is unchanged; this holds the value a NEW location is created
-- with, and the owner may additionally push a changed field to existing
-- locations. That keeps the blast radius to the write path.
--
-- Every column is nullable, and null means "no org default" — a location
-- created while a field is null falls back to that field's own column default,
-- exactly as today. Nullable is also what makes this safe to deploy ahead of
-- the API: existing rows stay valid and nothing reads it yet.
--
-- Scope is operating policy only. Sales tax is jurisdictional, store hours
-- differ per shop, and payment processor config is per-location payouts —
-- propagating any of those across an organization would be wrong, so they are
-- deliberately absent rather than merely unimplemented.
create table if not exists organization_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,

  -- location_feature_settings
  retail_products_enabled boolean,
  discount_codes_enabled boolean,

  -- location_scheduling_policy
  self_serve_default boolean,
  base_hourly_labor_cost numeric(10,2),
  payroll_burden_pct numeric(5,2),

  -- location_pricing_policy
  barber_request_mode text,
  flat_surcharge_amount numeric(10,2),

  -- location_communication_settings
  communications_enabled boolean,
  booking_confirmations boolean,
  appointment_reminders boolean,

  -- location_sanitation_settings
  sanitation_enabled boolean,
  sanitation_interval_hours integer,

  updated_at timestamptz not null default now()
);

-- The same bounds the per-location tables enforce. A default that could not be
-- applied to a location would be a trap: it would save at the org level and
-- then fail on push.
alter table organization_settings
  drop constraint if exists organization_settings_barber_request_mode_check,
  add constraint organization_settings_barber_request_mode_check
    check (barber_request_mode is null or barber_request_mode in ('same', 'per_staff', 'flat'));

alter table organization_settings
  drop constraint if exists organization_settings_labor_cost_check,
  add constraint organization_settings_labor_cost_check
    check (base_hourly_labor_cost is null or (base_hourly_labor_cost >= 0 and base_hourly_labor_cost <= 1000));

alter table organization_settings
  drop constraint if exists organization_settings_payroll_burden_check,
  add constraint organization_settings_payroll_burden_check
    check (payroll_burden_pct is null or (payroll_burden_pct >= 0 and payroll_burden_pct <= 100));

alter table organization_settings
  drop constraint if exists organization_settings_surcharge_check,
  add constraint organization_settings_surcharge_check
    check (flat_surcharge_amount is null or flat_surcharge_amount >= 0);

alter table organization_settings
  drop constraint if exists organization_settings_sanitation_interval_check,
  add constraint organization_settings_sanitation_interval_check
    check (sanitation_interval_hours is null or sanitation_interval_hours between 1 and 8);

-- Tenant isolation. This table carries organization_id, so rls-isolation.test.ts
-- requires RLS and a policy; the request transaction sets
-- app.current_organization_id (see rls-transaction.middleware.ts), and an
-- unscoped query fails closed rather than reading every organization's rows.
alter table organization_settings enable row level security;
drop policy if exists organization_isolation on organization_settings;
create policy organization_isolation on organization_settings
  using (organization_id = current_setting('app.current_organization_id')::uuid)
  with check (organization_id = current_setting('app.current_organization_id')::uuid);

comment on table organization_settings is
  'Org-wide defaults for operating policy. New locations are created from these; existing locations are only changed when the owner explicitly pushes a field.';
