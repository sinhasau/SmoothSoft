# SmoothSoft launch-readiness tracker

Living tracker for the P0 launch-hardening sprint. Reconciles the July‑21 backlog
against the **actual code state** as of commit `9209d91` (branch `codex/scheduler-redesign`).

Date reconciled: 2026-07-23 · Reconciled by: planner review of source

## How to use this

- One row per P0 requirement. `Backlog #` maps to items in
  [PLATFORM-UPDATE-BACKLOG-2026-07-21.md](./PLATFORM-UPDATE-BACKLOG-2026-07-21.md).
- **Verified reality** is what the code actually does today (file cited), not what the docs claim.
- Update `Status` and `Owner` as work lands. Keep `Evidence` pointing at the proving commit/PR/test.

### Status legend

| Status | Meaning |
|---|---|
| 🔴 Not started | No implementation exists |
| 🟠 Partial | Foundation exists; not launch-safe |
| 🟡 In review | Implemented, awaiting verification/tests |
| 🟢 Done | Implemented + verified + gated in CI |

---

## Reconciliation summary: docs vs. reality

The July‑21 assessment docs are **substantially accurate** — no inflated claims found. Corrections:

| Doc statement | Reality | Verdict |
|---|---|---|
| README: "apps/* are empty shells… no running application code" | 13 API modules, full web app, 45 migrations, 20 test files | ❌ **Stale/wrong — fix README** |
| "development sign-in" (backlog #1) | Login is roster‑pick by `locationStaffId` with **no password/credential at all**; schema has no credential columns | ✅ Accurate (understates: there is *nothing* to verify against) |
| "Stripe/Square server adapter foundations" | Real adapters w/ idempotency keys + client-side tokenization exist; refund routes back to original processor and only records on success | ✅ Accurate |
| "no provider worker currently sends" messages | `communications.controller` only **lists**; no worker, no Twilio/SendGrid, nothing sends | ✅ Accurate |
| "17 advisories (5 high, 12 moderate)" | Reproduced exactly via `npm audit` | ✅ Accurate |
| Role journeys "materially separated" | Enforced per-endpoint via `requireManager` / `requireFrontDeskOrManager`; **no systematic matrix or negative tests** | 🟠 Partial — real but unproven |
| CI "browser coverage remains a launch gate" | CI runs test + typecheck + build only; no E2E, no dep-scan, no migration test | ✅ Accurate |

**Docs are ~2 commits stale** (post-doc commits `f3599b7`, `9209d91` added appointments-in-queue + booking polish) but nothing in them is contradicted by newer code.

---

## P0 tracker — required before live public launch

### Identity, authorization & sensitive data

| # | Requirement | Verified reality | Status | Owner |
|---|---|---|---|---|
| 1 | Production identity (verified login, sessions, reset, recovery) | No credentials anywhere — `auth.controller.ts` logs in by picking a roster id. JWT session cookie itself is sound (httpOnly, sameSite, secure-in-prod, 12h, secret required in prod). | 🔴 | — |
| 2 | MFA, session revocation, login throttling, security-event logging | None. JWT is stateless → **cannot revoke** sessions. No throttling, no audit log. | 🔴 | — |
| 3 | Endpoint authorization matrix + automated negative tests | *2026-07-24:* role-guard primitives negative-tested across all 4 roles; source-level invariants assert every controller is public-listed or session-guarded and every guarded route asserts an auth tier, with crown-jewel ops pinned manager-only (`security/authorization.test.ts`, 15 tests, runs in CI). | 🟢 | — |
| 4 | Separate tax-data perms from manager; access logs for SSN/tax docs | SSN masking exists (`security/staff-pii.ts`); no separate permission tier or access log. | 🟠 | — |
| 5 | Retention/deletion/export/breach policies | Not present. | 🔴 | — |
| 6 | Secrets to managed store; ensure none in source control | `.env` committed to working tree — audit for leaked secrets/uploaded files. | 🔴 | — |

### Payments & financial correctness

| # | Requirement | Verified reality | Status | Owner |
|---|---|---|---|---|
| 7 | One processor: finish tokenization/onboarding/credential/health UI | Stripe + Square adapters real, idempotent; client tokenization via `card-payment-fields.tsx`. No connection-health UI, no onboarding flow. | 🟠 | — |
| 8 | Verified idempotent webhooks + reconciliation (all states) | **No webhook endpoint exists anywhere.** No reconciliation. | 🔴 | — |
| 9 | Processor-confirmed full/partial card refunds | Done well — `payments.service.ts:285` routes to original processor, records only on success, idempotency-keyed. | 🟢 | — |
| 10 | Voids, approval thresholds, refund perms, reason codes, exception queue | Refund requires manager + reason; no voids, thresholds, or exception queue. | 🟠 | — |
| 11 | Customer receipt delivery + reliable print | Receipt view/print exists; no delivery (depends on messaging). | 🟠 | — |
| 12 | Split tender, change due, drawer ownership, daily reconciliation | Cash drawer + variance exist (migration 0013); no split tender or processor-vs-platform reconciliation. | 🟠 | — |
| 13 | PCI scope review; document raw card never hits servers | Design intent present (external adapter comment); not documented/reviewed. | 🔴 | — |

### Messaging & public booking

| # | Requirement | Verified reality | Status | Owner |
|---|---|---|---|---|
| 14 | Connect provider + outbox worker (retry/idempotency/dead-letter) | Messages durably queued (`communication_messages`); **nothing sends them**. No worker, no provider. | 🔴 | — |
| 15 | Opt-in/out, quiet hours, consent, templates, test-send, sender id | None beyond client consent capture. | 🔴 | — |
| 16 | Public booking rate limits, bot protection, abuse monitoring, generic responses | Per-IP throttling now in place (10/min on writes + phone lookup). Still needs: bot/captcha, abuse monitoring, and OTP phone verification before `last-service` reveals client identity. | 🟠 | — |
| 17 | Customer cancellation/rescheduling with policy enforcement | *2026-07-24:* customer self-service cancel + reschedule shipped — public id-authorized endpoints (`queue/:id/cancel`, `booking/:id/{status,cancel,reschedule}`) + status page controls, verified live. Policy enforcement (cancellation cutoff windows, reschedule limits) still open. | 🟡 | — |
| 18 | Validate availability/reminders across TZ, DST, closures, special hours | *2026-07-23:* booking slot engine + all 3 appointment-create paths now anchor to location timezone (was server-local — wrong on a UTC server/DST). *2026-07-24:* broadened DST coverage — multi-timezone + both transition days + a no-DST zone (`common/time-dst.test.ts`, 11 tests). Closure/special-hours slot integration + reminder delivery still gated on a DB test harness and the messaging worker (#14). | 🟠 | — |

### Reliability & release engineering

| # | Requirement | Verified reality | Status | Owner |
|---|---|---|---|---|
| 19 | Isolated staging + production environments | Not present in repo. | 🔴 | — |
| 20 | Structured logs, error tracking, correlation, metrics, alerts | `main.ts` uses `console.log`; no structured logging/telemetry/alerting. | 🔴 | — |
| 21 | Automated backups + restore drill; RTO/RPO | Not present. | 🔴 | — |
| 22 | Migration preflight/backup/rollback + deploy runbooks | Migrations apply forward only (`npm db:migrate` loop); no rollback/runbook. | 🔴 | — |
| 23 | Seeded browser E2E for core journeys | None. 20 unit/component test files only. | 🔴 | — |
| 24 | CI gates: types, unit, build, migration, dep-scan, a11y, E2E | *2026-07-24:* migration-on-fresh-DB job added (`ci.yml` `migrations` — spins up Postgres, creates the app role, runs all 45 migrations + grants, asserts a late migration landed; validated locally). Now: test + typecheck + build + `npm audit` + migration. Still missing: a11y, browser E2E. | 🟠 | — |
| 25 | Resolve dependency vulns + recurring upgrade cadence | 17 open (5 high, 12 moderate) — all need breaking major upgrades. Dep-scan gate added (`critical`); upgrades themselves outstanding. | 🟠 | — |
| 26 | Stabilize local change set into reviewable PRs | `output/`/`outputs/` now gitignored. Working tree still uncommitted — organize into PRs. | 🟠 | — |

---

## Clear gaps surfaced by this reconciliation

Ranked by launch risk. Items **A–C** gate everything else.

- **A. No authentication.** Login is identity selection, not verification — anyone reaching the API can assume any staff/owner identity. This is the single blocker; money and PII correctness are moot without it. (#1, #2)
- **B. Messaging is a silent no-op.** Confirmations, reminders, and receipts *appear* queued and "sent" in the UI but **nothing leaves the building**. High demo-vs-reality risk. (#11, #14, #15)
- **C. No payment webhooks/reconciliation.** Refund path is solid, but without webhooks there's no source of truth for async payment states (disputes, delayed, failed-after-accept). (#8)
- **D. Public booking enumeration** — *partially mitigated 2026-07-23* with per-IP throttling
  (10/min). Still open: bot/captcha protection and OTP phone verification before `last-service`
  reveals a client's name. (#16)
- **E. No operational safety net.** No backups, staging, structured logging, or error tracking — a bad migration or crash has no recovery path. (#19–#22)
- **F. Authorization is real but unproven.** — *addressed 2026-07-24:* `security/authorization.test.ts` negative-tests the guard tiers and asserts (at the source level) that no controller or route can ship without an auth guard, with crown-jewel ops pinned manager-only. Runtime E2E role tests still want a DB harness. (#3)
- **G. README** — ✅ *fixed 2026-07-23.*

## Quick wins — completed 2026-07-23

1. ✅ **README corrected** — replaced the "empty shell / no running code" framing with an
   accurate built-vs-hardening summary; fixed the stale "8 migrations" count (now 45).
2. ✅ **CI dependency-audit gate added** — `npm audit --audit-level=critical` in `ci.yml`.
   Set to `critical` (0 today) so it passes now; tighten to `high`/`moderate` as #25 clears.
   Note: all 17 existing advisories need breaking major upgrades — `npm audit fix` clears none.
3. ✅ **`helmet` + rate limiting added** — `helmet()` in `main.ts`; global `ThrottlerModule`
   (300/min per IP) + `ThrottlerGuard` in `app.module.ts`. Verified: typecheck, build, 36 tests pass.
4. ⚠️ **Public endpoints throttled instead of gutted** — `queue/last-service`, `book`,
   `queue/join`, appointment cancel/reschedule, queue cancel now capped at 10/min per IP.
   The response was **deliberately not** made generic: it powers the "welcome back" prefill.
   Proper fix (OTP phone verification before revealing identity) stays open under #16.
5. ✅ **Secrets/output check** — `.env` already untracked and gitignored; added `output/` and
   `outputs/` (generated PDFs) to `.gitignore` so exports can't be accidentally committed.

### Follow-ups these surfaced (not quick wins)

- ThrottlerModule uses in-memory storage — **per-instance**. Move to Redis storage before
  running more than one API node, or limits are trivially bypassed by hitting another node.
- Global throttle keys on socket IP; behind a proxy/LB it needs `trust proxy` + `X-Forwarded-For`
  or every request looks like one client. Configure when staging (#19) lands.

---

## Booking & checkout hardening — 2026-07-23

Goal: take Booking and Checkout to a hardened, verifiable state. Backend correctness only —
all changes verified by typecheck + 46 API unit tests + production build.

**Done:**

- **B1 · Timezone-correct booking.** The slot engine computed availability with
  `new Date(\`${date}T${hh}:${mm}\`)` — **server-local** time, wrong on a UTC server and across
  DST. Now anchored to `location.timezone` via a new `instantFromWallClock` helper. Fixed the same
  latent UTC-date bug in **all three** appointment-create paths (public `book`, `createForStaff`,
  client `rebook`) and in `reschedule`'s availability window/lock key. DST unit tests added.
- **C1 · Checkout tamper guard.** Service line-item prices and `tip` were client-supplied and
  unvalidated (only retail was catalog-priced), so a crafted payload could submit a negative price/
  tip and lower the total. Added `validateCheckoutAmounts` (rejects negative/non-finite prices and
  tips; caps line-item count) with unit tests. Service prices stay staff-adjustable by design — only
  impossible values are rejected.
- **B2 · DB double-booking backstop.** Migration `0046` adds `btree_gist`, an app-maintained
  `appointments.ends_at` (+ backfill), and a partial `EXCLUDE` constraint preventing overlapping
  active appointments per professional. `ends_at` is now set on every insert/reschedule; the
  constraint violation is translated to a friendly conflict. This notably closes a real hole: the
  `rebook` path had **no advisory lock at all** and was relying on a single availability check.

**Deliberately deferred (with reasons) — not done in this pass:**

- **C2 · Move the card charge outside the DB transaction.** The RLS middleware wraps each request
  in one transaction, so `processor.charge()` runs while holding product row locks (dual-write
  window). A correct fix is a rewrite of the request/transaction model and belongs with the payment
  **webhook + reconciliation** work (#8), not a local edit. Idempotency keys currently narrow the risk.
- **C3 · Split tender + cash change-due**, **C4 · void vs. refund, approval thresholds, reason
  codes.** Real POS-completeness features, but they need the still-open **product decisions**
  (approval thresholds, who can void, tender policy) and frontend work that can't be verified without
  a running app/DB. Scope them once those decisions are made.
- **C5 · Receipt delivery** — gated on the messaging worker (#14).
- **Migration 0046 not yet run against Postgres** — code-reviewed only; no DB/CI migration gate
  exists in this environment (see #23/#24). Run it on staging before relying on the constraint.
- **Out-of-module TZ debt:** `queue.service.ts` still has a couple of server-local date constructions
  (closing-guard, appointment→queue matching). Left for a dedicated queue-module pass.
