# Scaling & indexing notes

Companion to `migrations/`. Each issue below is paired with the migration that addresses it, or flagged as a threshold to revisit later rather than build for now.

## 1. Event table growth

100,000 appointments/day × 3–5 events each ≈ 300,000–500,000 rows/day → **roughly 110–180 million rows/year**, growing forever since it's append-only by design.

- **Addressed now:** `idx_events_created_at_brin` (0007) uses a BRIN index instead of btree. BRIN indexes are a fraction of the size of btree for naturally time-ordered, append-only data and are sufficient for the range-scan access pattern (BI queries, "today's activity") this table actually needs.
- **Threshold to revisit:** once the table passes roughly the hundreds-of-millions-of-rows mark, partition `events` by month (native Postgres declarative partitioning on `created_at`). Not done now because it adds migration/ops complexity that isn't earning its keep yet — a single unpartitioned table with a BRIN index comfortably serves this table's read patterns well past 10,000-salon scale.

## 2. Per-location event sequencing

`events` needs `(location_id, sequence_no)` for correct undo/ordering. The naive approach — application code computing `max(sequence_no) + 1` — race-conditions under concurrent writes to the same location's queue.

- **Addressed now:** `location_sequence_counters` (0005) is a one-row-per-location counter table, incremented with `UPDATE ... RETURNING` inside the same transaction as the event insert. This serializes writes *per location* (correct and desired — one shop's queue shouldn't need to coordinate with another's) without creating 10,000 native Postgres sequences, which is an unnecessary amount of database object churn as locations get added and removed.

## 3. RLS + connection pooling (a real gotcha, not a hypothetical)

Row-Level Security (0008) depends on `current_setting('app.current_location_id')` being correct for the session. **This breaks silently under PgBouncer's transaction-mode pooling**, which is the pooling mode most platforms reach for at this scale — a plain `SET` on a pooled connection can leak across unrelated requests that happen to grab the same underlying connection.

- **The fix, not yet a migration (this is an application/ops concern, not a schema one):** use `SET LOCAL` inside every transaction, which is scoped correctly even under transaction-mode pooling, rather than a session-level `SET`. This needs to be enforced in the application's data-access layer (e.g. a middleware that wraps every request in `BEGIN; SET LOCAL app.current_location_id = ...; ... COMMIT;`), not left to individual query call sites to remember.
- **Why this matters enough to flag explicitly:** getting this wrong doesn't throw an error — it silently returns another tenant's data under load. This is the single most important thing to get right before this schema goes anywhere near production traffic.

## 4. Client search at scale

The original prototype computed the phone match key at query time (`.replace(/\D/g,'')`) and had no path for fuzzy name search at all.

- **Addressed now:** `clients.phone_normalized` (0003) is written once at insert/update time and indexed directly (0007) — no per-query string processing. `idx_clients_name_trgm` (0007) adds `pg_trgm`-backed fuzzy search, since front-desk staff typing a partial name expect instant results, not an exact match.

## 5. Reporting queries competing with the live queue for latency

"Today's revenue," "this month by location," and per-staff earnings all scan `transactions`. At 100,000 appointments/day this is a meaningful table, and these queries must never slow down a checkout happening at the same moment.

- **Addressed now:** `idx_transactions_location_created` and `idx_transactions_staff_created` (0007) support the actual filter patterns (location + date range, staff + date range) directly.
- **Already flagged in the architecture doc, worth restating here:** a **read replica** for Reports/BI traffic is the real fix once dashboard load becomes noticeable on the primary — indexing alone delays but doesn't eliminate that need. Not a migration concern; an infrastructure one.
- **Threshold to revisit:** if "today's revenue" dashboards are refreshed constantly (e.g. auto-polling every few seconds across many open manager screens), consider a small materialized rollup table (daily totals per location) refreshed on a short interval, rather than aggregating raw transactions on every dashboard load. Not needed yet — live aggregation over an indexed, reasonably-sized daily transaction set is fine at current scale.

## 6. Compensation history correctness

The original prototype's `commission_pct`/`booth_rent_weekly` were plain mutable columns — changing a rate silently rewrites history, which is exactly the kind of error that looks fine until a payroll audit recalculates a past period against the *current* rate instead of the rate that was actually in effect.

- **Addressed now:** `staff_compensation_history` (0002) is effective-dated, not mutable. Two supporting indexes (0007): a partial index for the common "what's the current rate" lookup, and a range index for point-in-time historical lookups during payroll runs.

## 7. Noisy-neighbor risk across tenants

A single very large organization's query/write volume could, in principle, degrade performance for smaller tenants sharing the same physical tables and indexes.

- **Not addressed in schema — flagged as a threshold, not a current problem.** At 10,000 salons averaging ~10 appointments/day, no single realistic tenant dominates total volume enough to matter. If a small number of enterprise-scale multi-location chains join the platform later and this becomes real, the mitigation is connection-pool tiering (dedicated pool allocation for the largest tenants) or, in the extreme case, moving a specific large tenant to a dedicated database — not a change to this schema.

## 8. Row-Level Security coverage gaps

0008 covers every table that's queried standalone. Child tables reached only via a join to an already-isolated parent (`transaction_items`, `phone_bindings`, `staff_schedule_days`, `staff_compensation_history`, `refunds`) don't yet have their own direct RLS policies.

- **This is a deliberate sequencing choice, not an oversight — but it needs to be closed before any endpoint queries these tables directly** (rather than always through a join to their parent). Add direct policies (typically via a subquery back to the parent's `location_id`) as soon as any such endpoint exists, not after.
