# Database

8 sequential migrations. Apply in order against a fresh Postgres 15+ database:

```bash
for f in migrations/0*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

Or point a real migration tool (node-pg-migrate, Prisma Migrate, Flyway — pick
whichever your app framework prefers) at these files; they're written as plain,
tool-agnostic SQL specifically so they aren't locked to one migration runner yet.

## Migration order and what each one does

| File | Contents |
|---|---|
| `0001_core_tenancy.sql` | Extensions, `organizations`, `locations` — the tenancy root |
| `0002_staff.sql` | `users`, `location_staff` (many-to-many), `staff_schedule_days`, `staff_compensation_history` (effective-dated) |
| `0003_clients_identity.sql` | `clients`, `phone_bindings`, `global_client_accounts`, `client_identity_links` — see the phone-recycling design in ARCHITECTURE-data-and-perspectives.md Part 3 |
| `0004_catalog_and_settings.sql` | `services`, `products`, `store_hours`, `tax_config`, `queue_config` |
| `0005_events_and_queue.sql` | The event-sourced `events` table (source of truth), `location_sequence_counters`, `queue_entries` (projection) |
| `0006_financials.sql` | `transactions`, `transaction_items`, `refunds` — append-only |
| `0007_indexes.sql` | Composite/specialized indexes, each tied to a specific query — see SCALING-AND-INDEXING-NOTES.md for the reasoning behind each one |
| `0008_row_level_security.sql` | RLS policies enforcing tenant isolation |

## The one thing you must get right before writing application code

RLS depends on `app.current_organization_id` / `app.current_location_id` being set
correctly per request. **If you introduce PgBouncer in transaction-pooling mode
(likely, at scale — see SCALING-AND-INDEXING-NOTES.md §3), a plain `SET` will leak
across unrelated requests sharing a pooled connection.**

Use `SET LOCAL` inside every transaction, enforced by middleware wrapping every
request — never trust individual query call sites to remember this. Getting this
wrong doesn't throw an error. It silently returns another tenant's data under load.
Test this explicitly, with two concurrent simulated tenants, before this goes near
real traffic.

## Not yet done

- 0008 covers tables queried standalone. Child tables reached only via a join to
  an already-isolated parent (`transaction_items`, `phone_bindings`,
  `staff_schedule_days`, `staff_compensation_history`, `refunds`) need their own
  direct RLS policies the moment any endpoint queries them without that join.
- No seed data / fixtures yet for local development.
- No migration-down (rollback) scripts — add these before this touches a shared
  environment.
