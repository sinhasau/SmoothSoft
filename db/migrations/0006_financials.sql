-- 0006_financials.sql
-- transactions is append-only by design (see architecture doc Part 1.5) —
-- there is deliberately no updated_at and no code path that UPDATEs a row
-- here. Refunds are new rows referencing the original, which is what
-- actually satisfies the 3-7 year audit-retention requirement from the
-- platform PRD's Tax module: history is never rewritten.

create table transactions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  client_id uuid references clients(id),
  location_staff_id uuid references location_staff(id),
  subtotal numeric(10,2) not null,
  tax numeric(10,2) not null default 0,
  tip numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_method text not null check (payment_method in ('card','cash')),
  payment_processor_ref text,           -- Stripe payment_intent / charge id
  created_at timestamptz not null default now()
);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  name text not null,
  item_type text not null check (item_type in ('service','retail')),
  price numeric(10,2) not null,
  taxable boolean not null default false
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  original_transaction_id uuid not null references transactions(id),
  amount numeric(10,2) not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Baseline FK indexes
create index idx_transactions_location_id on transactions (location_id);
create index idx_transactions_client_id on transactions (client_id);
create index idx_transaction_items_transaction_id on transaction_items (transaction_id);
create index idx_refunds_original_transaction_id on refunds (original_transaction_id);
