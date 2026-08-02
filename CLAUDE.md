# Working in this repo

Read before making changes. These are rules learned from things that actually
broke, not general style preferences.

## Database migrations

**Every migration must be safe to run against a database that already has it.**
No exceptions. This is enforced by `apps/api/src/db/migration-safety.test.ts`,
which fails CI on any file numbered 0051 or higher containing statements that
would error on a second run.

What that means in practice:

| Instead of | Write |
|---|---|
| `create table t (…)` | `create table if not exists t (…)` |
| `create index i on t (c)` | `create index if not exists i on t (c)` |
| `create unique index i on t (c)` | `create unique index if not exists i on t (c)` |
| `alter table t add column c …` | `alter table t add column if not exists c …` |
| `alter table t drop column c` | `alter table t drop column if exists c` |
| `create function f …` | `create or replace function f …` |
| `create view v …` | `create or replace view v …` |

Postgres has no `if not exists` form for these, so guard them explicitly:

- **`create policy`** — precede with `drop policy if exists <name> on <table>;`
- **`create trigger`** — precede with `drop trigger if exists <name> on <table>;`
- **`create type`** — wrap in
  `do $$ begin create type … ; exception when duplicate_object then null; end $$;`

Always idempotent already, no guard needed: `alter table … enable row level
security`, `comment on …`, plain `update`/`insert … on conflict`.

Migrations 0001–0050 predate this rule and are grandfathered. Do not lower
`GUARDED_FROM` in the safety test, and do not add exemptions to it.

### Running migrations

`npm run db:migrate` applies only what a database is missing, tracked in the
`schema_migrations` table, one transaction per file. It is safe to run
repeatedly and from any state.

- `npm run db:migrate:dry-run` — list what would run, change nothing
- `npm run db:migrate:baseline` — one-time adoption for a database that was
  migrated by hand before tracking existed. Records every file as applied
  **without executing any of it**. Refuses to run if anything is already tracked.

`DATABASE_MIGRATE_URL` must point at the **table-owning** role, never the app
role — the app connects as `salon_app`, which RLS policies apply to. See
`.env.example` and `db/grant-app-role.sql`.

**Deploying a schema change:** there is no pre-deploy migration hook in
`render.yaml`. Migrations are applied manually, and must land **before** the
API build that depends on them starts serving.

## Testing

- Both apps use **vitest**, tests colocated as `*.test.ts` / `*.test.tsx`.
- `cd apps/api && npx vitest run` · `cd apps/web && npx vitest run`
- Typecheck both (`npx tsc --noEmit`) and build the web app
  (`npx next build`) before saying a change is done.
- Prefer extracting logic into a pure module and testing that, over leaving it
  inline and untested. `nav-sections.ts`, `lateness.ts`, and `visit-notes.ts`
  exist for exactly this reason.

## Time and timezones

Anything involving a shop's calendar day, weekday, or opening hours must go
through `apps/api/src/common/time.ts` and use the **location's** timezone.
Never `new Date().getDay()`, `toISOString().slice(0,10)`, or
`new Date(\`${date}T00:00:00\`)` — those read the server clock. On a UTC server
hosting a US shop that silently shifts the business day, which has already
caused customers to be turned away during real opening hours.

## Duplicated logic between apps/api and apps/web

`apps/web` cannot import from `apps/api`. Where a rule must exist on both sides
(e.g. `lateness.ts`), duplicate it deliberately, say so in a comment on both
copies, and give each its own tests pinning the same numbers so they cannot
drift silently.

## Frontend

- One shared `Modal` in `apps/web/components/modal.tsx`. Do not hand-roll
  another — a duplicated copy is how the same "can't scroll to the submit
  button on mobile" bug shipped twice.
- Sizing that must respect a phone viewport uses `dvh`, never `vh`; `vh` is
  measured with the browser chrome hidden.
- The location nav comes from `buildNavSections()`. Desktop sidebar and mobile
  bottom nav must both derive from it, so a section cannot exist on one and not
  the other.
