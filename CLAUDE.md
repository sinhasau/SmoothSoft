# Working in this repo

Read before making changes. These are rules learned from things that actually
broke, not general style preferences.

## How to approach any change

Hold four perspectives at once. They disagree, and the disagreement is the
point — a change that satisfies only one of them is usually the wrong change.

- **CEO** — does this serve the business we are actually building? What does it
  cost to run, support, and undo? Is this the highest-value use of the effort,
  or a detour that feels productive?
- **Product manager** — what is the real job the user is hiring this for? Which
  workflow does it sit in? What is the smallest version that genuinely solves
  it? What breaks for someone mid-shift when this ships?
- **Software architect** — where does this belong? What does it couple to?
  What will this look like at 10x the data and 10x the locations? Is this a
  special case, or the general rule surfacing?
- **Coder** — is it correct at the boundaries, tested, readable by the next
  person, and honest about what it does not handle?

And always the **customer's** perspective — the person in the chair and the
barber holding the clippers. They do not care about the model. They care that
the wait time is right, the button works on a phone, and nothing surprises
them. When an internal abstraction and a customer's experience conflict, the
customer wins.

Practically: state the trade-off you are making and why, rather than silently
picking one. If a request would be better served by something adjacent to what
was literally asked, say so in a sentence — then do what was asked unless told
otherwise.

## Product docs (PRDs) are part of the change

`docs/` is the source of truth for intended behavior, not a historical
artifact. The ones that matter most:

| Doc | Covers |
|---|---|
| `PRD-salon-management-platform.md` | The 13 product modules and what each must do |
| `PRD-live-queue-checkin.md` | The flagship live-queue / check-in module |
| `wait-time-algorithm-spec.md` | Wait-time math, spec vs. what is built |
| `ARCHITECTURE-data-and-perspectives.md` | Multi-tenancy, event sourcing, roles |
| `PRODUCT-STRATEGY-personas-workflows-differentiators.md` | Personas and workflows |

**Before starting any behavioral change:**

1. **Read the relevant PRD section.** Not skimmed — find what it actually
   specifies about the area being changed.
2. **Write down what is being requested** and how it relates to what the PRD
   says: does it match, extend, contradict, or fill a gap the PRD left open?
3. **If it changes documented intent, stop and ask for approval before
   building.** Say plainly what the PRD currently says, what the change would
   make it say, and what that trades away. A request that quietly contradicts
   the PRD is usually a decision worth making explicitly, not a detail.
4. **Update the PRD in the same commit as the code.** Never ship behavior that
   makes a doc wrong. A spec that lies is worse than no spec, because the next
   person trusts it. If the built version is deliberately simpler than the
   spec, say so in the doc and mark what is not built — as
   `wait-time-algorithm-spec.md` §0 does.

Docs that describe something superseded should say so in place, with the
reasoning, rather than being silently overwritten — the "why we changed our
mind" is the valuable part.

## Backwards compatibility

**Assume something already depends on current behavior**: a running shop, a
queue full of real customers, a phone with the app open, a row already in the
database. Default to additive.

- **Database** — add columns and tables; do not rename or drop in the same
  change that stops using them. New columns need a default or must be nullable,
  so existing rows stay valid. A migration must never require the new API build
  to already be running.
- **API responses** — adding a field is safe; removing or retyping one is not.
  An older client must keep working against a newer server, because during any
  deploy both are live at once.
- **Request payloads** — new fields must be optional with a sane default. Do
  not make a previously optional field required.
- **Stored data** — code must tolerate rows written by every earlier version,
  including nulls where a value is now always written.
- **Settings and config** — a missing setting must fall back to today's
  behavior, not to an error or a new default that silently changes operations.

When a genuinely breaking change is the right call, **say so and get approval
first**, with the migration path: what breaks, who notices, and how it is
sequenced (usually add → migrate → switch → remove, across separate deploys).
Do not smuggle a breaking change in as an implementation detail.

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

- `npm run db:migrate:dry-run` — list what would run. Changes nothing, not even
  creating the tracking table.
- `npm run db:migrate:baseline` — one-time adoption for a database that was
  migrated by hand before tracking existed. Records files as applied **without
  executing any of them**. Refuses to run if anything is already tracked.
  - Add `--through <file>` when the database is behind: everything up to and
    including `<file>` is marked applied, everything after stays outstanding
    and gets applied properly by the next `db:migrate`.
  - Baselining past where the database actually is, is unrecoverable in
    practice — those migrations are marked applied, `db:migrate` says "up to
    date" forever, and the schema silently never gets them. Verify against the
    schema (does the column the last migration adds exist?) before baselining.

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
