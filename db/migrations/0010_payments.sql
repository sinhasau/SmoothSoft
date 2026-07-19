-- 0010_payments.sql
-- Additive on top of 0001-0009. Widens the payment surface from the original
-- cash/card-only field (0006_financials.sql) to support real processor
-- integration (Stripe, Square) plus a reference-number-only manual/external
-- path for processors we don't integrate directly.
--
-- Per-transaction payment data stays exactly as strict as the architecture
-- doc requires: never a raw card number, only a processor-issued token/ref
-- (transactions.payment_processor_ref, already present in 0006) or, for the
-- external path, a staff-entered confirmation number with no card data at
-- all.

-- 0006_financials.sql's payment_method check only allowed ('card','cash').
-- Drop and recreate the constraint to add 'external' (paid via a terminal/
-- processor we don't integrate with directly) without touching the rest of
-- that table.
alter table transactions drop constraint transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method in ('card', 'cash', 'external'));

-- Which processor is active for a location, and which adapter it maps to.
-- Only ever stores the PUBLISHABLE key (safe to ship to the browser) or an
-- account/location identifier — secret keys live in server-side env vars
-- only (STRIPE_SECRET_KEY / SQUARE_ACCESS_TOKEN), never in this table.
create table payment_processor_config (
  location_id uuid primary key references locations(id),
  active_processor text not null default 'external' check (active_processor in ('stripe', 'square', 'external')),
  stripe_publishable_key text,
  stripe_connected_account_id text,     -- Stripe Connect: per-location payout account
  square_application_id text,
  square_location_id text,
  card_fee_pct numeric(5,2) not null default 2.90,   -- estimated processing fee shown on the close-up-shop checklist
  updated_at timestamptz not null default now()
);

alter table payment_processor_config enable row level security;
create policy location_isolation on payment_processor_config
  using (location_id = current_setting('app.current_location_id')::uuid);
