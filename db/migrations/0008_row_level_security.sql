-- 0008_row_level_security.sql
-- Enforces the isolation model from the architecture doc at the database
-- layer, not just in application code: a session simply cannot read or
-- write rows outside app.current_location_id / app.current_organization_id.
--
-- OPERATIONAL WARNING (see scaling notes): these session variables must be
-- set with SET LOCAL inside each transaction, not a plain SET on a pooled
-- connection — see SCALING-AND-INDEXING-NOTES.md for why this matters
-- once PgBouncer transaction-mode pooling is introduced.

alter table locations enable row level security;
create policy org_isolation on locations
  using (organization_id = current_setting('app.current_organization_id')::uuid);

alter table location_staff enable row level security;
create policy location_isolation on location_staff
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table clients enable row level security;
create policy org_isolation on clients
  using (organization_id = current_setting('app.current_organization_id')::uuid);

alter table services enable row level security;
create policy location_isolation on services
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table products enable row level security;
create policy location_isolation on products
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table store_hours enable row level security;
create policy location_isolation on store_hours
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table tax_config enable row level security;
create policy location_isolation on tax_config
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table queue_config enable row level security;
create policy location_isolation on queue_config
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table location_goals enable row level security;
create policy location_isolation on location_goals
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table events enable row level security;
create policy location_isolation on events
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table queue_entries enable row level security;
create policy location_isolation on queue_entries
  using (location_id = current_setting('app.current_location_id')::uuid);

alter table transactions enable row level security;
create policy location_isolation on transactions
  using (location_id = current_setting('app.current_location_id')::uuid);

-- Tables reached only via a parent FK (transaction_items, phone_bindings,
-- staff_schedule_days, staff_compensation_history, etc.) inherit isolation
-- through a join to their parent in application queries; add direct RLS
-- policies on them too once those tables are queried standalone rather
-- than always joined — flagged in scaling notes as a follow-up, not
-- skipped by oversight.
