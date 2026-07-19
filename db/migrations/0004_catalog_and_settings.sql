-- 0004_catalog_and_settings.sql
-- Services/products, and settings normalized OUT of the single-JSONB-blob
-- shortcut noted as an MVP tradeoff in the original architecture doc.
-- Now that BI (Module 7) is real scope, "what was the tax rate on the day
-- of this transaction" needs to be queryable, which a mutable JSONB
-- config blob can't answer — these are proper tables now.

create table services (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  duration_minutes int not null,
  price numeric(10,2) not null,
  taxable boolean not null default false
);

create table products (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  price numeric(10,2) not null,
  stock_qty int not null default 0
);

create table store_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  open_time time,
  close_time time,
  unique (location_id, day_of_week)
);

create table tax_config (
  location_id uuid primary key references locations(id),
  retail_tax_pct numeric(5,2) not null default 0,
  services_taxable boolean not null default false
);

create table queue_config (
  location_id uuid primary key references locations(id),
  cleanup_buffer_minutes int not null default 3,
  overrun_increment_minutes int not null default 5,
  long_shift_threshold_hours int not null default 5,
  long_shift_extra_minutes int not null default 5,
  max_break_minutes int not null default 30,
  appointment_max_wait_minutes int not null default 10,
  appt_atrisk_notify_minutes int not null default 15
);

-- Baseline FK indexes
create index idx_services_location_id on services (location_id);
create index idx_products_location_id on products (location_id);
create index idx_store_hours_location_id on store_hours (location_id);
