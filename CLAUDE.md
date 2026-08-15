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

**Deploying a schema change:** there is still no pre-deploy hook in
`render.yaml` — Render's `preDeployCommand` needs a paid instance type and the
API is on `plan: free`. Migrations are applied by running the **Migrate
production database** workflow (`.github/workflows/migrate-production.yml`)
from the Actions tab, and must land **before** the API build that depends on
them starts serving.

Run it once with `apply` unchecked to see what is outstanding — that is a true
dry run, it does not even create the tracking table — then again with `apply`
checked. It runs `db:migrate` and `db:grant-app-role` only; it cannot reset,
drop or seed. Afterwards it fails the run if `schema_migrations` and the files
on disk disagree, which is the one way a database can end up silently behind
while `db:migrate` reports "Up to date".

The connection string lives in the `PRODUCTION_DATABASE_MIGRATE_URL` repository
secret. Do not paste a production connection string into a terminal, a commit,
or a chat — it is the table-owning role, it bypasses RLS, and it can drop every
table. If one is ever exposed, rotate it in Neon and update both `DATABASE_URL`
and `DATABASE_MIGRATE_URL` in Render before doing anything else.

### Shipping a migration and the code that needs it

**A migration and the code that depends on it must not merge in the same pull
request.** This is the single rule; everything below is why, and how.

Migrations are applied by hand from the Actions tab, but the API redeploys on
merge. So between those two moments production runs the **new code against the
old schema**. Postgres raises `undefined_column`, and whatever that endpoint
backs is down until someone notices and runs the workflow.

This has caused three outages. The worst was `GET /dashboard/org`, which backs
*every* page in the owner workspace — Home, Locations, Team, Payroll and
Reports all failed together, reported simply as "majority of stuff on the
owner's organization workpage is broken". The window is not theoretical or
brief: it lasts until a person opens the Actions tab.

**Sequence it as two pull requests:**

1. **Migration only.** Additive, and safe against a database that already has
   it (see the table above). Merge it, then run the **Migrate production
   database** workflow and confirm it applied.
2. **The code that uses the new columns.** Merge after step 1 is live. Now
   there is no window — the schema was already there.

`deploy-window` in CI enforces this. It builds the schema **the base branch
has**, then runs this branch's code against it and sweeps every parameterless
`GET` as every role in the seed
(`apps/api/src/db/deploy-window.test.ts`). A pull request that adds both a
migration and code needing it fails there, with the endpoints named. The
`migrations` job runs the same sweep against the full schema as a control, so a
route failing in both is an ordinary bug rather than an ordering problem.

Do not skip the job or narrow the sweep to get a merge through — splitting the
pull request is the fix, and it takes minutes. The sweep enumerates routes from
the live Express router rather than a list precisely so new endpoints are
covered without anyone remembering; `SKIP` in that file is for routes excluded
for reasons about the route, not about the schema.

**When the two genuinely cannot be split** — a column that must be backfilled
by the same code that reads it — the code must tolerate the old schema on its
own (read defensively, fall back to today's behaviour when the column is
absent) so that it passes the base-schema sweep honestly. Say so in the pull
request, and say why splitting was not possible.

`rethrowIfSchemaBehind` (`apps/api/src/common/schema-readiness.ts`) is the last
line, not the fix: when this is got wrong anyway, it turns the bare 500 into a
503 naming the migration to run. Guard new endpoints with it when they read
freshly added columns.

## Testing

- Both apps use **vitest**, tests colocated as `*.test.ts` / `*.test.tsx`.
- `cd apps/api && npx vitest run` · `cd apps/web && npx vitest run`
- Typecheck both (`npx tsc --noEmit`) and build the web app
  (`npx next build`) before saying a change is done.
- Prefer extracting logic into a pure module and testing that, over leaving it
  inline and untested. `nav-sections.ts`, `lateness.ts`, and `visit-notes.ts`
  exist for exactly this reason.

### Run the app. Every change. No exceptions.

**Passing tests are not evidence that a change works.** They are evidence that
the code agrees with the assumptions of whoever wrote the tests. When those
assumptions are the bug, the suite goes green and ships it.

That is not hypothetical. The clock-in menu was changed to lead with staff
scheduled today. Eleven tests passed, typecheck was clean, the build was green,
CI was green — and it was broken on arrival, because every fixture defaulted to
`scheduledToday: true` and no test asked what happens when **nobody** is
scheduled. It shipped on a Sunday, when nobody is. The seed roster
(`[1,2,4,5,6]`) and the day of the week were both plainly visible the whole
time. Nothing caught it except the owner opening his shop and finding he could
not put a barber on the floor.

So, before saying any change is done:

1. **Start it and use it.** Migrate and seed a local database, run the API and
   the web app, open the screen the change touches, and perform the action a
   real person would perform. Chromium and Playwright are installed
   (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); never run
   `playwright install`.
2. **Desktop is the main flow, and it has to be perfect. Then the phone.**

   Every change is verified at **both**, desktop first, and neither one is
   optional. They are not equal in standard:

   | | Viewport | Standard |
   |---|---|---|
   | **Desktop** — the main flow | 1440×900 | **Perfect.** No defect ships. |
   | **Mobile** — secondary, still critical | 390×844 | Fully usable. No blocker, no lockout, no unreachable control. |

   Desktop is where the work actually happens: the owner reviewing pay periods,
   the manager building next week's schedule, the front desk running the floor
   for eight hours. It is the surface people live in, so "good enough" is not a
   passing grade there — layout, alignment, focus order, keyboard access,
   hover and disabled states, and every number on the screen have to be right.

   Mobile being second in priority never means second in correctness. It is the
   barber holding clippers and the owner checking in from the car, and this
   repo's history is full of mobile-only breakage: a submit button under the
   home indicator, a nav section that exists only on desktop, a `title`
   attribute explaining a disabled control that touch devices never show. A
   mobile blocker is still a blocker.

   Checking one and inferring the other is not verification. State both
   viewports explicitly when reporting, and if only one was driven, say which.
3. **Exercise the empty and degenerate states deliberately.** Zero staff on the
   roster, nobody clocked in, nobody scheduled, everyone inactive, an empty
   queue, a closed shop. These are where the real reports come from, and they
   are exactly the states a happy-path fixture never reaches.

   For any condition the change branches on, run the **all** case, not just the
   **some** case. Both clock-in regressions were "some staff are X" logic that
   broke when *every* staff member was X — nobody scheduled on a Sunday, every
   barber marked inactive at one location. A mixed fixture passes both times
   and proves nothing about either.
4. **Say what was actually verified.** "231 tests pass and it builds" is a true
   statement about the tests. It is not "I checked it works", and reporting it
   as though it were is how a broken build gets a green summary.

If running it genuinely is not possible for a change, say so in that sentence —
plainly, up front — rather than letting a green test summary imply more than it
earned.

### Tenant isolation

`apps/api/src/db/rls-isolation.test.ts` is the one suite that needs a real
Postgres — RLS is database behaviour, and mocking it would prove nothing. It
skips unless `RLS_TEST_OWNER_URL` and `RLS_TEST_APP_URL` are set, and runs in
the CI `migrations` job, which already builds a migrated database with
`salon_app` granted.

**Any new table with a `location_id` or `organization_id` column must enable
row level security and carry a policy.** The suite enumerates tables from the
Postgres catalog rather than a hand-kept list, so it fails the moment an
unprotected one appears and names it. Do not add it to `NOT_TENANT_SCOPED` to
make the failure go away — that list is only for tables genuinely outside the
tenancy model, and each entry says why.

Remember `create policy` needs a preceding `drop policy if exists` to stay
re-runnable; the migration-safety gate checks that the drop names the same
policy *and* the same table, and comes first.

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
  button on mobile" bug shipped three times. `Modal` carries props for every
  reason someone previously reached for a bespoke overlay (`size`, `padded`,
  `dismissible`, `elevated`, `panelClassName`, `panelRef`); extend it rather
  than copy it. `modal-is-the-only-overlay.test.ts` fails on any `fixed
  inset-0` outside that file.
- Sizing that must respect a phone viewport uses `dvh`, never `vh` or
  `min-h-screen` (Tailwind's alias for `100vh`); `vh` is measured with the
  browser chrome hidden. Same test enforces this.
- `app/layout.tsx` must keep `viewportFit: 'cover'`. Without it every
  `env(safe-area-inset-*)` silently resolves to `0` on iOS, which made the
  modal's home-indicator padding a no-op on the one device it was written for
  — nothing looked wrong in the CSS, so it survived a round of "fix the modal
  on mobile".
- Controls must stay usable with a thumb: a real 44px minimum touch target,
  and disabled-with-a-reason rather than removed from the DOM. A control that
  disappears when it does not apply cannot be found by someone looking for it.

### An empty state must never stand in for a failed request

`?? []` on query data turns a total failure into a calm, plausible screen. The
queue board did exactly this: `GET /queue/board` returned 500 on every load in
production — `queue_entries.late_arrival` was missing because a migration had
never been applied — and the page rendered "No staff clocked in yet", "No one
is waiting", and a disabled "+ clock in". It looked like a quiet shop. It was a
total outage, and it survived days of looking straight at it.

- **Check `isError` before rendering anything derived from the data.** Render
  `components/data-unavailable.tsx`, which says the load failed, shows the
  error, and offers a retry.
- **An empty state means "we asked and there is nothing".** It must never mean
  "we could not ask". If those two look identical on screen, the screen is
  lying.
- When a UI bug resists explanation, **check whether the request behind it is
  actually succeeding** before changing the component again. Three rounds of
  clock-in fixes were aimed at a control that was never broken.

### Never silently drop rows from a list a person acts on

The rule above applies to the **contents** of a control, not just the control.
A filter that hides people or options is a lockout waiting to happen, because
the filter's own edge case — *everything matches it* — leaves an empty list and
no explanation.

This has now happened twice on one control, the "+ clock in" menu:

- Staff not on today's schedule were tucked behind a reveal. On a Sunday
  **nobody** is scheduled, so the menu opened onto no names.
- Staff not marked `active` were filtered out entirely. At a location where
  **every** barber was inactive, the list came back empty, the button disabled
  itself, and the message read "Everyone is already clocked in" beside a strip
  that said "No staff clocked in yet". The owner could not put anyone on the
  floor and the screen actively misinformed him.

So:

1. **Group, do not filter.** Anything less relevant goes behind a labelled
   reveal that states what it is and how many (`Not scheduled (2)`,
   `Not active (3)`) — never removed. Grouping may change how many taps a name
   takes; it must never change whether the name exists.
2. **Only real emptiness disables a control.** Disable on "there is genuinely
   nothing to act on", never on "our grouping rule consumed everything".
3. **Derive the empty-state message from the actual reason**, and check it
   against what the rest of the screen is saying. Two statements that
   contradict each other on the same card are worse than no message.
4. **Pin the invariant with a test** — "every item handed in is reachable" —
   and one test per grouping rule for the case where *all* rows match it.
- The location nav comes from `buildNavSections()`. Desktop sidebar and mobile
  bottom nav must both derive from it, so a section cannot exist on one and not
  the other.
