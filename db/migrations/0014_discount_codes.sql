-- 0014_discount_codes.sql
-- Adds discount-code management to billing/checkout, requested after the
-- initial Payments module build. Location-scoped (matches
-- payment_processor_config's pattern) rather than org-scoped, since pricing
-- policy is a per-shop decision like tax_config and queue_config.

create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  code text not null,
  discount_type text not null check (discount_type in ('percent', 'flat')),
  value numeric(10,2) not null,
  active boolean not null default true,
  expires_at date,
  usage_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (location_id, code)
);

create index idx_discount_codes_location on discount_codes (location_id);

alter table discount_codes enable row level security;
create policy location_isolation on discount_codes
  using (location_id = current_setting('app.current_location_id')::uuid);

-- Append-only transactions (0006) never get edited, but a checkout that
-- used a code needs to record which one and how much it took off, for the
-- same reason payment_processor_ref is recorded — an auditable receipt of
-- exactly what happened at sale time, not a value that could drift if the
-- code is later changed or deleted.
alter table transactions
  add column discount_code_id uuid references discount_codes(id),
  add column discount_amount numeric(10,2) not null default 0;
