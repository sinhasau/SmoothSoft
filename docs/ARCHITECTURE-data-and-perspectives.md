# Platform Architecture — Data Storage & User Perspectives

**Scope:** Replaces the in-memory prototype state with a real multi-tenant, multi-location data architecture, and defines the role-based perspectives that architecture needs to enforce. Read alongside `PRD-salon-management-platform.md` and `PRD-live-queue-checkin.md`.

---

## Part 1 — Data architecture

### 1.1 The core decision: multi-tenancy model

**Recommendation: shared database, multi-tenant, with `organization_id` and `location_id` as first-class columns on every operational table, enforced by Postgres Row-Level Security (RLS).**

Why, against the alternatives:

| Option | Verdict |
|---|---|
| Database-per-tenant | Rejected. Barbershops are small businesses (1–10 locations typically) — thousands of tiny databases means thousands of migrations to run on every schema change, and connection-pool exhaustion at any real scale. This is the model to avoid for a horizontal SaaS serving many small customers. |
| Schema-per-tenant | Rejected for the same reason at smaller scale — still one schema-migration-run per tenant. |
| **Shared DB + tenant column + RLS** | **Chosen.** One schema, one set of migrations, isolation enforced at the database layer (not just application code) via RLS policies keyed to the authenticated session's `organization_id`/`location_id` claims. This is the standard pattern for this class of product (Vagaro/Boulevard-scale) and scales to hundreds of thousands of tenants on a single well-tuned Postgres cluster before sharding is even a conversation. |

**Hierarchy:** `Organization` (the legal business, e.g. "JJ's Barbers LLC") owns one or more `Location`s (physical shops). Almost all operational data — queue, staff, clients, transactions — is scoped to `location_id`. A smaller set of data (owner accounts, billing/subscription, org-wide BI rollups) is scoped to `organization_id` only, spanning locations. Staff membership in a location is many-to-many by design — a staff member can be assigned to more than one location, toggle-controlled per organization (see "Multi-location staff assignment" below).

**Client-data-ownership question (platform PRD open question #9):** clients belong to the `Organization`, not to an individual staff member's account. Each client record carries a `referring_staff_id` for attribution, and export/portability rules around a departing staff member are a per-organization policy setting, not something the data model can unilaterally decide — that's a legal decision the owner makes, which the platform then enforces.

### 1.2 Core entity model (high level)

```
organizations
  └─ locations (fk organization_id)
       ├─ location_staff (fk location_id, fk user_id) — role, classification (w2/1099), schedule, compensation
       ├─ clients (fk organization_id; primarily accessed through location context)
       ├─ services, products (fk location_id — pricing can differ per location)
       ├─ queue_entries / appointments (fk location_id)
       ├─ transactions → transaction_items (fk location_id)
       ├─ events (fk location_id) — the append-only log, see 1.3
       └─ settings (fk location_id) — store hours, tax config, queue-algorithm config, goals
users (login identity, separate from location_staff — one user can staff multiple locations)
```

### Multi-location staff assignment (toggle-based)

Confirmed: staff can work multiple locations at once, and this is an organization-level toggle, not an always-on capability.

```sql
alter table organizations add column allow_staff_multi_location boolean not null default false;

-- location_staff is already the many-to-many join; the toggle governs whether
-- more than one active row per user_id is permitted, enforced at the app layer
-- (and optionally a deferred constraint trigger) rather than the schema itself,
-- since the rule is a business policy that can change over time.
alter table location_staff add column is_primary boolean not null default false;
```

- With the toggle **off** (the default), a staff member has exactly one active `location_staff` row — today's behavior, no change needed for single-location shops.
- With the toggle **on**, an owner can assign a staff member to additional locations. `is_primary` marks their default landing location and reporting home; a location-switcher appears in the UI for anyone with more than one active assignment.
- **Scheduling guard, not a hard block:** warn (don't silently prevent) when a staff member's weekly schedule overlaps across two locations — legitimate cases exist (a stylist covering a shift at a sister location), so this should surface a confirmation rather than reject the assignment outright.
- **Downstream effect on Reports/Goals:** earnings and goals become properties of the `(staff, location)` pair, not the staff member alone. The Reports module needs both a per-location view (what it does today) and a combined cross-location rollup for multi-location staff, visible to anyone with cross-location visibility (Owner, or a Manager granted that permission — see below).

### Manager permission flexibility (configurable, not fixed)

The earlier open question — should some managers see full financials and others not — is resolved as: **yes, build it as configurable permission grants, not as two hardcoded manager tiers.** A fixed "junior manager" role would just recreate the same rigidity one level down. Instead:

```sql
alter table location_staff add column permission_overrides jsonb not null default '{}';
```

- Each role (`location_manager`, `staff`, `front_desk`) has a **default permission set**. `permission_overrides` lets an Owner grant or revoke individual permissions per person, merged over the role default at auth-check time.
- Permission catalog (extensible): `view_financials`, `view_staff_compensation`, `edit_settings`, `edit_staff_roster`, `view_compliance_docs`, `edit_compliance_docs`, `process_refunds`, `view_all_staff_notes`.
- Owners work from **named presets** in the UI (e.g. "Full Manager," "Shift Lead") that are just saved permission-flag bundles — not separate roles in the schema — so adding a new preset later is a UI/config change, not a migration.
- RLS policies and application authorization checks reference a **resolved-permissions function** (role defaults merged with overrides) rather than a raw role string, so this stays enforceable at the database layer, not just trusted to the frontend.



The prototype's snapshot-based undo and single-shared-tab-of-truth model don't survive real, multi-device usage. The fix is the same architectural change the PRDs already called out as a prerequisite for BI:

**Introduce an append-only `events` table as the source of truth.** The "live" queue state shown in the UI becomes a **materialized projection** built by folding events forward — not the source of truth itself.

```sql
create table events (
  id bigint generated always as identity primary key,
  location_id uuid not null references locations(id),
  sequence_no bigint not null,  -- per-location monotonic, assigned by the DB
  event_type text not null,      -- 'client_checked_in', 'service_started', 'service_completed', ...
  entity_id uuid,                -- the queue_entry/appointment/transaction this event acted on
  actor_user_id uuid references users(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create unique index on events (location_id, sequence_no);
```

This single change solves three problems the prototype flagged separately:

1. **Real undo** — a compensating event (`"undo: service_started"`), not restoring a client-side JSON blob. Works correctly even if other events happened in between.
2. **Multi-device concurrency** — events append with a server-assigned, location-scoped sequence number. Two staff editing the same queue simultaneously get a well-defined order; the one genuinely conflict-prone action (drag-reorder of the waiting list) needs a small amount of operational-transform logic, everything else (check-in, start, complete, status change) is naturally commutative or last-write-wins per entity.
3. **Reporting & BI** — trend, cohort, and forecasting features (platform PRD Module 7) read directly from the event log instead of needing separate instrumentation bolted on later.

No need for Kafka or a dedicated event-store product at this scale — a well-indexed Postgres table plus `LISTEN/NOTIFY` (below) is sufficient until a single location is doing enterprise-grade event volume, which barbershops are not.

### 1.4 Real-time sync across devices

**Requirement:** the shop tablet, a barber's phone, and the front-desk screen all see the same live queue, instantly.

**Recommendation:** Postgres `LISTEN/NOTIFY` (or a managed realtime layer — Supabase Realtime, Ably, Pusher) pushing event-log deltas to connected clients filtered by `location_id`. Avoid polling entirely; it doesn't scale and adds latency exactly where the product's whole value proposition is speed.

**Offline resilience:** client apps queue pending events locally (IndexedDB on a tablet) and replay them on reconnect. The server assigns canonical sequence numbers on receipt, so any ordering conflict from a dropped connection resolves server-side — the UI shows a "syncing" indicator rather than blocking staff input while wifi is flaky, which matters a lot on a shop floor.

### 1.5 Financial and tax data

The `transactions` table (with `transaction_items` for the line-item breakdown established in the POS build) is the financial system of record: **append-only, never mutated after creation.** Refunds and adjustments are new, linked transactions, not edits to history — this is what actually satisfies the audit-ready-records requirement in the Tax & Financial Management module (3–7 year retention, defensible to an auditor).

**Payment data:** never store raw card numbers. Tokenize through the payment processor (Stripe/Square) and store only the token, last 4 digits, and card brand. This is what keeps the PCI-DSS obligation (flagged in the Legal & Risk module) mostly on the processor's shoulders rather than the platform's.

### 1.5b How the isolation model is verified

The RLS design above was, until recently, asserted but never tested. That is a
tolerable gap with one owner on the platform and an unacceptable one with many:
a policy bug is invisible in the first case and a breach in the second.

`apps/api/src/db/rls-isolation.test.ts` now pins it against a real Postgres, in
the CI `migrations` job. It covers four things:

1. **Policy coverage** — every table carrying `location_id` or
   `organization_id` has RLS enabled and at least one policy. Tables are
   enumerated from the Postgres catalog, not a maintained list, so a new
   unprotected table fails CI the moment it exists. This immediately found one:
   `location_sequence_counters`, unprotected since 0005, fixed in migration
   0052.
2. **Enforcement preconditions** — the app role is not superuser, does not hold
   `BYPASSRLS`, and owns none of the tenant tables. `pool.ts` guards the
   connection *string*; this guards the role's actual attributes, which is the
   failure mode where every policy still looks correct in the schema.
3. **Behaviour** — org A cannot read, insert into, update, or delete org B's
   rows, including bumping B's event sequence counter.
4. **Fail-closed** — a query with no scope set errors rather than returning
   everything, and the scope does not survive its transaction. That second one
   guards the worst bug available here: a session-level `SET` instead of
   `set_config(..., true)` would carry one tenant's scope into the next
   tenant's request on a pooled connection.

**Still open** (unchanged from 0008's closing note): tables reached only via a
parent FK inherit isolation through the join rather than a policy of their own.
The coverage test does not flag them because they carry no tenant column. That
remains correct only while they are never queried standalone.

### 1.6 Concrete storage recommendations

| Concern | Recommendation |
|---|---|
| Primary database | Postgres, managed (RDS / Supabase / Neon) — relational integrity matters heavily here given transactions, tax, and payroll data |
| Tenant isolation | Row-Level Security policies on every tenant-scoped table, keyed to `organization_id`/`location_id` from the authenticated session — enforced by the database, not just application code |
| File storage | S3-compatible object storage for photos, signed waivers, license documents — referenced by URL from Postgres rows, never stored inline |
| Real-time / cache | Redis or a managed realtime service for live-queue pub/sub and session state |
| Search | Postgres full-text search for client name/phone lookup is sufficient at this scale — don't reach for Elasticsearch prematurely |

### 1.7 Example RLS policy (illustrative)

```sql
alter table queue_entries enable row level security;

create policy location_isolation on queue_entries
  using (location_id = current_setting('app.current_location_id')::uuid);
```

Every tenant-scoped table gets an equivalent policy. The application sets `app.current_location_id` (and `app.current_organization_id` where relevant) from the authenticated session at the start of each request — a staff member's session simply cannot see rows outside their assigned location(s) at the database layer, regardless of what the application code does or doesn't check.

---

## Part 2 — Perspectives (the exercise)

Each perspective below is: what they see, what they can do, and how it maps to the data model above. This is also where the prototype's "shared device / personal device" toggle gets replaced with something real — that toggle was a UI convenience, not a security boundary, since anyone could switch modes and see anything. Real roles fix that.

### Owner
- **Sees:** everything, org-wide, across every location — consolidated financials, all staff records and compensation, BI/forecasting, the Legal & Risk/compliance tracker, platform billing.
- **Primary screens:** cross-location dashboard, financial reports (P&L, cash flow), staff roster and compensation across locations, org-level settings, compliance tracker.
- **Data model:** `role = org_owner`, scoped by `organization_id`, spans all `location_id`s under it.

### Manager (per-location)
- **Sees:** everything the Owner sees, scoped to the location(s) they manage. Cannot touch org-level billing or add/remove locations.
- **Primary screens:** full live queue control, staff scheduling for their location, location settings, location-level reports.
- **Data model:** `role = location_manager`, scoped to one or more specific `location_id`s.

### Barber / Stylist
- **Sees:** their own chair and queue entries, their own clients' notes and history, their own earnings and goal progress. **Cannot** see other staff's revenue, commission rates, or shop-wide financials — a real gap in the prototype, where "personal device" mode was cosmetic rather than enforced.
- **Booth-renter (1099) nuance:** visibility may need to be *more* restricted than a W-2 employee's, not less — the Legal & Risk module flags that a platform controlling a contractor's day-to-day too tightly cuts against their independent-contractor status. Access scope should be configurable per classification, not identical by default.
- **Data model:** `role = staff`, scoped to their own `user_id` within a `location_id`; row-level policies additionally filter by `assigned_staff_id = current_user` on queue/client/earnings tables.

### Front Desk / Reception
- **Sees:** the full live queue and check-in tools, client contact info, appointment booking for the location. **Not** payroll, individual commission rates, or other staff's personal earnings.
- **Data model:** `role = front_desk`, scoped to one `location_id`, with explicit column/table exclusions on compensation data regardless of location scope.

### Client (customer-facing)
- **Sees:** the public booking page, their own appointment history, live wait-position ("you're 2nd in line") — this is a **separate application surface** (platform PRD Modules 3/10), not a stripped-down staff view.
- **Auth model:** phone OTP or magic link, not a staff login — a client account has no `location_staff` row at all, just a `clients` record they can view/edit within strict limits (contact info, upcoming appointments), enforced by RLS scoped to `client_id = current_client`.

### Permissions matrix

*Manager column shows role defaults — every cell is individually overridable per person via `permission_overrides` (see "Manager permission flexibility" above).*

| Domain | Owner | Manager (default) | Staff | Front desk | Client |
|---|---|---|---|---|---|
| Live queue (own location) | Full | Full | Own entries + start/complete | Full | View own position only |
| Client contact info | Full | Full | Own clients | Full | Own record only |
| Client notes/history | Full | Full | Own clients' | View only | Own visible history |
| Financial reports | Full, all locations | Location only | None | None | None |
| Individual staff earnings | Full, all staff | Location's staff | Own only | None | N/A |
| Settings (hours, services, tax) | Full | Location only | None | None | N/A |
| Staff roster/compensation | Full | Location only | Own record (view) | None | N/A |
| Compliance/legal tracker | Full | View only | Own docs (licenses, insurance) | None | N/A |
| Platform billing | Full | None | None | None | N/A |

This table is the actual spec for the RLS policies in Part 1 — each cell becomes a policy condition on the relevant table.

---

## Part 3 — Client identity across organizations: the phone-number risk

You're right to be concerned here — this is a real, well-known failure mode, not a theoretical edge case. Phone carriers recycle numbers after a period of inactivity, and people change numbers. **Treating a phone number as a permanent identity key means a stranger's walk-in can silently inherit a previous person's visit history, notes, allergy flags, and (if a cross-org account exists) their history at other businesses too.** That's a privacy failure, not just a UX glitch.

### The fix: two tiers of identity, not one

**Local client profile (org-scoped)** — what's already built. Created passively at check-in, phone number as a *loose* match key, good enough for one shop's day-to-day. Low stakes: worst case, a shop's own record gets attributed to the wrong regular.

**Global client account (cross-organization)** — a materially stronger identity, only relevant if the platform lets clients get recognized across *different* businesses (a real Vagaro/Booksy-style feature). This must be built on **explicit, user-initiated verification** — the client enters their phone, receives an OTP, confirms it's theirs. **Never auto-created or auto-linked just because the same phone number showed up as a walk-in at two different organizations.** That auto-link is exactly the scenario that leaks one person's cross-business history to whoever now holds their old number.

```sql
create table global_client_accounts (
  id uuid primary key default gen_random_uuid(),
  phone text,                    -- current verified phone, not a permanent key
  email text,
  verified_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table client_identity_links (
  local_client_id uuid not null references clients(id),
  global_account_id uuid not null references global_client_accounts(id),
  linked_at timestamptz not null default now(),
  verification_method text not null,  -- 'sms_otp', 'email_otp'
  primary key (local_client_id, global_account_id)
);
```

### Protecting the local (weak) profile too — the staleness check

Even within a single org, the current design (silently trust any phone match forever) has the same underlying bug. Fix:

```sql
alter table clients add column last_confirmed_at timestamptz;
```

- `last_confirmed_at` updates any time a real interaction confirms identity (a checkout, an explicit "yes, this is them" at check-in).
- If a recognized phone number's `last_confirmed_at` is older than a **configurable staleness threshold**, check-in should **soft-prompt staff** — *"This number is on file for Marcus J., last seen 11 months ago. Same person, or start a new profile?"* — instead of silently loading his history onto whoever just walked in.
- **Trade-off, not a fact:** too short a threshold annoys legitimately-returning-but-infrequent clients; too long leaves a wider reassignment window open. Default to something like 6 months as a starting point, but make it an org-level Settings field — the right number depends on the shop's actual visit cadence and the owner's own risk tolerance, not a universal constant.

### Controlled unbinding — for when the mismatch is caught

```sql
create table phone_bindings (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  client_id uuid not null references clients(id),
  bound_at timestamptz not null default now(),
  superseded_at timestamptz          -- null while active
);
```

- If staff or a client flags a mismatch, an admin action **supersedes** the old binding (`superseded_at`) rather than deleting anything. The old profile keeps its full history under its own opaque `client_id` — it just loses the phone number as a match key going forward.
- The phone number is then free to bind fresh to a new local profile for whoever actually holds it now.
- This also gives a clean audit trail if a client ever disputes "someone else saw my history" — you can show exactly when the binding existed and when it was cut.

### Why the global account needs a higher bar

The stakes are categorically different for the cross-org identity: a reassigned number there doesn't just misattribute one shop's notes, it can expose a person's history *across every business on the platform* to whoever now holds their old digits. So beyond requiring OTP verification to create the link in the first place:

- Consider **periodic re-verification** for the global account (re-OTP at some interval, or at minimum before surfacing sensitive cross-org history at a *new* organization the client hasn't visited before).
- **Never auto-merge** two local profiles from different organizations into a shared global account based on phone match alone — always require the explicit OTP step, even if it's mildly more friction for legitimate returning clients. The asymmetry matters: the cost of extra friction is small; the cost of a silent cross-business identity leak is not.



## Part 4 — Remaining open questions

Resolved this round: multi-location staff (built as an org-level toggle), manager permission tiers (built as configurable overrides, not fixed roles), and org-level settings — see below. What's still open:

1. **Staleness threshold default.** 6 months was proposed as a starting point for the local-profile re-confirmation prompt — is that right for typical visit cadence in this business, or should it be shorter/longer? This is a policy call, not something the architecture can decide alone.
2. **Notification on unbind.** If a phone binding is superseded because staff caught a mismatch, should the *old* profile's owner (if reachable another way — email on file, etc.) be notified their number changed hands? Not required, but worth a decision either way.
3. **Cross-org account scope, revisited.** Given the two-tier model above, does the platform actually want to offer a client-facing cross-org account at launch (adds real complexity: OTP infra, re-verification policy, a client-facing auth surface), or is that a Phase 2 feature once single-org local profiles are solid? Worth deciding before Module 3 (online booking) is built, since a client-facing login is naturally where this would live.
4. **Retention for orphaned local profiles.** When a phone binding is superseded, the old profile's history sticks around under its opaque `client_id` with no live match key. Does that need its own retention/cleanup policy, or does it just sit there indefinitely as historical record (consistent with the 3–7 year audit-retention requirement already established for financial data)?

## Part 5 — Org-level settings (built)

Part 2 lists "org-level settings" among the Owner's primary screens, but every
settings table in the schema is keyed by `location_id`, so an owner with three
shops opened three settings pages and kept them in sync by hand. This is what
was built, and the reasoning, since the propagation semantics were left open.

**Defaults with an explicit push, not inheritance.** `organization_settings`
(migration 0053) holds one nullable row per organization. A new location is
created from it; existing locations are only changed when the owner explicitly
chooses to push. Every read path is unchanged — a location still reads its own
row — which keeps the blast radius to the write path.

The rejected alternative was true inheritance (`COALESCE(location.value,
org.value)` at read time). It is conceptually cleaner and copies nothing, but it
changes what "a shop's setting" means, touches every read site across ten
tables, and makes a shop that never customised silently follow the org. That may
still be the right end state; it was not the right first step.

**Every save names one field.** The API takes `{ key, value, scope }` and writes
exactly one column, on both the org row and — when `scope` is `all` — each
location's row. A whole-row save would carry along every other value the form
was holding and quietly overwrite per-shop customisations the owner never
touched. `null` in the org row means "no default set", so a shop created while a
field is null keeps that column's own default.

**Push updates, never inserts.** If a shop has no row in a settings table yet it
is running on column defaults; creating a half-populated row during a push would
freeze that table's other values at today's defaults — a silent override of
settings nobody changed.

**Scope is operating policy only.** Features, scheduling policy, request
pricing, client messaging and sanitation. Sales tax is jurisdictional, store
hours differ per shop, chair count is physical, and payment processor config is
per-location payouts — propagating any of those across an organization would be
wrong, so they are absent by decision rather than by omission. The test
`org-settings-fields.test.ts` asserts they stay absent.

Owner-only, enforced by `requireOwner()`: a location manager is scoped to the
locations they manage (Part 2), and these defaults reach past that boundary.
