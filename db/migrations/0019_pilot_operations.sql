-- 0019_pilot_operations.sql
-- Durable pilot workflows: measurable queue promises, schedule publication,
-- consent/rebooking, stable checkout attempts, receipts, and audited refunds.

alter table queue_entries
  add column estimated_start_at timestamptz,
  add column service_started_at timestamptz,
  add column service_completed_at timestamptz;

create table schedule_publications (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  week_start date not null,
  status text not null check (status in ('published', 'superseded')),
  warning_count integer not null default 0,
  notify_scope text not null default 'all' check (notify_scope in ('all', 'affected')),
  published_by_user_id uuid references users(id),
  published_at timestamptz not null default now()
);
create unique index idx_schedule_one_current_publication on schedule_publications(location_id, week_start) where status = 'published';

create table client_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  client_id uuid not null references clients(id),
  consent_type text not null,
  version text not null,
  accepted boolean not null,
  captured_by_user_id uuid references users(id),
  captured_at timestamptz not null default now(),
  notes text
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  client_id uuid not null references clients(id),
  service_id uuid not null references services(id),
  location_staff_id uuid references location_staff(id),
  starts_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
  source text not null default 'staff_rebook' check (source in ('staff_rebook', 'public_booking', 'walk_in_conversion')),
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  queue_entry_id uuid not null references queue_entries(id),
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'requires_action')),
  amount_cents integer not null,
  processor text not null,
  processor_ref text,
  error_message text,
  transaction_id uuid references transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, idempotency_key)
);

alter table transactions add column receipt_number text;
create unique index idx_transactions_receipt_number on transactions(location_id, receipt_number) where receipt_number is not null;
alter table refunds
  add column refunded_by_user_id uuid references users(id),
  add column processor_ref text,
  add column status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed'));

create index idx_queue_accuracy on queue_entries(location_id, service_started_at) where service_started_at is not null;
create index idx_appointments_location_start on appointments(location_id, starts_at);
create index idx_appointments_client_start on appointments(client_id, starts_at desc);
create index idx_client_consents_client on client_consents(client_id, captured_at desc);
create index idx_schedule_publications_location_week on schedule_publications(location_id, week_start desc);

alter table schedule_publications enable row level security;
create policy location_isolation on schedule_publications using (location_id = current_setting('app.current_location_id')::uuid);
alter table appointments enable row level security;
create policy location_isolation on appointments using (location_id = current_setting('app.current_location_id')::uuid);
alter table payment_attempts enable row level security;
create policy location_isolation on payment_attempts using (location_id = current_setting('app.current_location_id')::uuid);
alter table client_consents enable row level security;
create policy organization_isolation on client_consents using (organization_id = current_setting('app.current_organization_id')::uuid);

-- These child tables are now queried directly by Phase 1 endpoints. Close
-- the direct-RLS gap called out in SCALING-AND-INDEXING-NOTES.md §8.
alter table refunds enable row level security;
create policy refund_location_isolation on refunds using (
  exists (select 1 from transactions t where t.id = original_transaction_id and t.location_id = current_setting('app.current_location_id')::uuid)
);
alter table transaction_items enable row level security;
create policy transaction_item_location_isolation on transaction_items using (
  exists (select 1 from transactions t where t.id = transaction_id and t.location_id = current_setting('app.current_location_id')::uuid)
);
