-- 0007_indexes.sql
-- Indexes beyond the baseline FK coverage already added table-by-table.
-- Each one below is tied to a specific query this platform actually runs,
-- not a speculative "index everything" pass.

-- Client check-in lookup: "find client by phone" runs on every walk-in and
-- appointment intake, all day, across every location. A plain btree on the
-- normalized column is enough since it's an exact-match lookup, not fuzzy.
create index idx_clients_phone_normalized on clients (phone_normalized);

-- Client search box (name): staff type a partial name, expect instant
-- results. A plain btree can't do "contains" efficiently; pg_trgm (enabled
-- in 0001) gives fast fuzzy/substring matching at this scale.
create index idx_clients_name_trgm on clients using gin (name gin_trgm_ops);

-- Active phone binding lookup: "does this number currently belong to
-- someone" is checked on every check-in. A PARTIAL unique index does two
-- jobs at once — it's the fast lookup path AND it enforces the actual
-- business rule (only one active binding per phone number) at the
-- database layer, not just in application code.
create unique index idx_phone_bindings_active
  on phone_bindings (phone_normalized)
  where superseded_at is null;

-- Appointment barber-matching: "which staff are scheduled at this
-- location on this weekday during this time window" runs on every
-- appointment booking and reschedule. This is the query that was
-- impossible to index efficiently before staff_schedule_days existed
-- as its own table.
create index idx_staff_schedule_lookup
  on staff_schedule_days (location_staff_id, day_of_week, start_time, end_time);

-- Event log time-range reads: BI/reporting and "activity today" queries
-- filter by location + a time window. BRIN, not btree, is the deliberate
-- choice here — events are inserted in near-timestamp order and the table
-- will grow to hundreds of millions of rows (see scaling notes); BRIN
-- indexes are dramatically smaller than btree for naturally-ordered
-- append-only data and are sufficient for range scans, which is the only
-- access pattern this index needs to serve.
create index idx_events_created_at_brin on events using brin (created_at);

-- Transaction reporting: "today's revenue," "this month's revenue by
-- location" are the single most frequent Reports-tab query. Composite
-- index on (location_id, created_at) supports the date-range filter
-- directly instead of scanning all of a location's transaction history.
create index idx_transactions_location_created
  on transactions (location_id, created_at);

-- Per-staff earnings lookups (Reports tab, payroll export): filter by
-- who worked the transaction across a date range.
create index idx_transactions_staff_created
  on transactions (location_staff_id, created_at);

-- Compensation history: "what rate was in effect on date X" — the whole
-- point of normalizing this table (0002) only pays off if this lookup
-- is fast. Partial index on effective_to IS NULL covers the much more
-- common "what's the CURRENT rate" case cheaply; the full index below
-- covers historical point-in-time lookups for payroll runs.
create index idx_staff_comp_current
  on staff_compensation_history (location_staff_id)
  where effective_to is null;
create index idx_staff_comp_effective_range
  on staff_compensation_history (location_staff_id, effective_from, effective_to);
