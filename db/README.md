# Database

## Local one-time setup (native Postgres via Homebrew — no Docker required)

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

export PATH="/usr/local/opt/postgresql@16/bin:$PATH"
psql -d postgres -c "CREATE ROLE salon LOGIN PASSWORD 'salon_dev_password' CREATEDB;"
psql -d postgres -c "CREATE DATABASE salon_platform OWNER salon;"

cp .env.example .env   # DATABASE_MIGRATE_URL (owner) + DATABASE_URL (app) both point here

npm run db:migrate           # applies whatever this database is missing
npm run db:grant-app-role    # creates salon_app and grants it table access — see below
```

`db:migrate` tracks what it has applied in `schema_migrations` and runs each
file in its own transaction, so it is safe to run repeatedly and from any
state. `db:migrate:dry-run` lists what would run and changes nothing at all —
it will not even create the tracking table.

For a database that was migrated by hand before tracking existed, run
`db:migrate:baseline` once. It records files as applied **without executing any
of them**, so it must be told where the database actually got to:

```bash
# the database really does have every migration in db/migrations
npm run db:migrate:baseline

# the database was hand-migrated only as far as 0049
node scripts/migrate.mjs --baseline --through 0049_service_default.sql
npm run db:migrate      # applies 0050 onwards properly
```

Baselining past where the database actually is, is the one unrecoverable
mistake here: those files are marked applied, `db:migrate` reports "up to
date" forever, and the schema silently never gets them. When unsure, check the
schema for something the last migration added rather than guessing.

**Every new migration must be safe to re-run** (`create table if not exists`,
`add column if not exists`, `drop policy if exists` before `create policy`, and
so on). `apps/api/src/db/migration-safety.test.ts` fails CI otherwise. See
CLAUDE.md for the full table.

10 sequential migrations. Apply in order against a fresh Postgres 15+ database
(the `db:migrate` script does this):

```bash
for f in migrations/0*.sql; do
  psql "$DATABASE_MIGRATE_URL" -f "$f"
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
| `0009_scheduling_and_compliance.sql` | `schedule_exceptions` (date-specific coverage changes), `schedule_change_requests` (pending approval flow), `compliance_documents` (license/insurance expiry tracking) — added for the Schedule and Dashboard screens, not present in the original handoff |
| `0010_payments.sql` | Widens `transactions.payment_method` to add `'external'`, adds `payment_processor_config` (which processor is active per location) — added to support real Stripe/Square integration plus a manual reference-number fallback |

## Two things you must get right before writing application code

**1. RLS is bypassed for the table-owning role.** Postgres does not enforce
Row-Level Security policies against a table's owner (or a superuser),
regardless of the policy's `USING` clause. Verified locally while standing
this up: querying as the migration-owning role (`salon`) returned rows across
two simulated tenants even with RLS enabled; querying as a second, non-owner
role (`salon_app`) correctly returned only the scoped tenant's rows. **The
application must connect as `salon_app` (`DATABASE_URL`), never as the
migration-owning role (`DATABASE_MIGRATE_URL`).** Run `npm run db:grant-app-role`
after `db:migrate` (and after any future migration that adds tables) to keep
`salon_app`'s grants current — see `db/grant-app-role.sql`.

**2. RLS depends on `app.current_organization_id` / `app.current_location_id`
being set correctly per request, with `SET LOCAL`, not plain `SET`.** If you
introduce PgBouncer in transaction-pooling mode (likely, at scale — see
SCALING-AND-INDEXING-NOTES.md §3), a plain `SET` leaks across unrelated
requests sharing a pooled connection. **Reproduced locally as a regression
check:** on a single connection, a plain `SET app.current_location_id = 'A'`
inside one transaction was still visible to a *second, unrelated* transaction
on that same connection after the first committed — `SET LOCAL` does not have
this problem, since it's scoped to just the transaction it was issued in.

Use `SET LOCAL` inside every transaction, enforced by middleware wrapping every
request (see `apps/api/src/common/rls-transaction.interceptor.ts`) — never trust
individual query call sites to remember this. Getting this wrong doesn't throw
an error. It silently returns another tenant's data under load.

## Not yet done

- 0008 covers tables queried standalone. Child tables reached only via a join to
  an already-isolated parent (`transaction_items`, `phone_bindings`,
  `staff_schedule_days`, `staff_compensation_history`, `refunds`) need their own
  direct RLS policies the moment any endpoint queries them without that join.
- No migration-down (rollback) scripts — add these before this touches a shared
  environment.
