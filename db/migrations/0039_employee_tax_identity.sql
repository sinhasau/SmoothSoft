create table if not exists employee_tax_identities (
  location_staff_id uuid primary key references location_staff(id) on delete cascade,
  ssn_ciphertext text not null,
  ssn_last_four char(4) not null check (ssn_last_four ~ '^[0-9]{4}$'),
  encryption_key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table employee_tax_identities enable row level security;
create policy location_isolation on employee_tax_identities
  using (location_staff_id in (select id from location_staff where location_id = current_setting('app.current_location_id')::uuid))
  with check (location_staff_id in (select id from location_staff where location_id = current_setting('app.current_location_id')::uuid));

comment on table employee_tax_identities is 'Restricted tax identity data. Never return ssn_ciphertext through a general API.';
