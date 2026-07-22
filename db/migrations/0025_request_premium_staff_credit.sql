alter table location_pricing_policy
  add column if not exists credit_surcharge_to_staff boolean not null default true;
