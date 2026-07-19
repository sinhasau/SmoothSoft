-- 0013_cash_drawer.sql
-- The close-up-shop checklist's cash drawer reconciliation (HANDOFF-master.md
-- confirmed decision: "starting float + cash sales = expected, actual count,
-- variance") needs a starting float value per location, which
-- payment_processor_config (0010) didn't yet have — everything else it
-- holds is processor selection, not cash handling.

alter table payment_processor_config
  add column starting_cash_float numeric(10,2) not null default 200.00;

-- One row per location per calendar day the shop was closed out — the
-- actual count, computed expected amount, and variance, plus which of the
-- 7 checklist tasks were completed. Kept as its own table (not just an
-- event) since Reports/BI will want to query "which days had a cash
-- variance" directly.
create table shop_closings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  closed_by_user_id uuid references users(id),
  closing_date date not null,
  starting_float numeric(10,2) not null,
  cash_sales_total numeric(10,2) not null,
  expected_cash numeric(10,2) not null,
  actual_cash_count numeric(10,2) not null,
  variance numeric(10,2) not null,
  card_sales_total numeric(10,2) not null,
  estimated_card_fee numeric(10,2) not null,
  tasks_completed text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (location_id, closing_date)
);

create index idx_shop_closings_location_date on shop_closings (location_id, closing_date);

alter table shop_closings enable row level security;
create policy location_isolation on shop_closings
  using (location_id = current_setting('app.current_location_id')::uuid);
