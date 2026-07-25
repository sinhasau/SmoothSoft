# Salon Platform

A multi-tenant salon/barbershop management platform — real-time queue management,
POS, staff/payroll, and BI, built around an event-sourced Postgres backend.

This repo is a **working supervised-pilot build**, not yet a production system of
record. The connected operating loop — booking → check-in → live queue → service →
checkout/refund → staff settlement → reporting — is implemented against a real
event-sourced Postgres backend with row-level multi-tenancy. What remains before an
unattended public launch is launch-hardening (production identity, payment webhooks,
message delivery, observability), tracked in
[docs/LAUNCH-READINESS-TRACKER.md](docs/LAUNCH-READINESS-TRACKER.md).

## Layout

```
docs/                    Design docs — read these first, in this order:
  PRD-salon-management-platform.md         13 product modules, what each needs to do
  PRD-live-queue-checkin.md                Detailed spec for the flagship module
  wait-time-algorithm-spec.md              The wait-time math, full spec vs. what's built
  ARCHITECTURE-data-and-perspectives.md    Multi-tenancy, event sourcing, roles/permissions
  SYSTEM-ARCHITECTURE-platform.md          Frontend/backend/cloud/integrations/AI/privacy
  SCALING-AND-INDEXING-NOTES.md            Why each index exists, known scaling thresholds
  PRODUCT-STRATEGY-personas-workflows-differentiators.md   Personas, workflows, market bets

db/migrations/           45 sequential SQL migrations — the actual normalized schema.
                          Apply in numeric order (0001 → 0045). See db/README.md.

apps/web/                Next.js + React + TypeScript — owner/staff dashboard + public booking
apps/api/                NestJS — the core modular monolith (see architecture doc §2)
apps/ai-service/         Python/FastAPI — the one deliberately separate service (no-show
                          risk scoring, scheduling assist, review drafting — see §5)
apps/mobile/             React Native — staff app + client app (two separate apps, not one)

packages/shared-types/   TypeScript types shared between apps/web and apps/api
```

## What's built vs. what still needs hardening

**Built and working** (traceable in `apps/`):
- 13 NestJS modules — auth, booking, appointments, queue (+ websocket gateway), clients,
  payments (Stripe/Square/manual adapters), schedule, reports, dashboard, settings, PII.
- Full Next.js app — owner/org dashboard, live queue, schedule, checkout/sales, clients,
  staff, reports, settings, and a public booking flow.
- 45 SQL migrations applied against real Postgres, RLS policies enforced through
  request-scoped transactions that set the tenant session variables.
- Payment refunds route back to the original processor and record only on confirmation;
  checkout locks and decrements stock; pay-run snapshots export to PDF/XLSX.
- 20 unit/component test files; TypeScript checks and both production builds pass.

**Not yet launch-ready** (see the tracker for the full P0 list):
- **Identity** — sign-in selects a staff identity with no password/credential verification.
- **Payments** — no webhook/reconciliation layer for async processor states.
- **Messaging** — confirmations/reminders queue durably but no worker sends them yet.
- **Ops** — no staging/prod separation, backups, structured logging, or E2E CI gate;
  17 open dependency advisories.

## How to actually build this

**Don't try to build all 13 modules at once.** The PRD's own phasing (§7) is the
right order, and it's worth repeating here:

1. **Foundation first.** Get `db/migrations` running against a real Postgres instance
   (see `db/README.md`). Stand up the NestJS skeleton with the RLS session-variable
   middleware described in the architecture doc — get this right before writing a
   single feature, since it's the thing that silently fails under connection pooling
   if done wrong (see SCALING-AND-INDEXING-NOTES.md §3).
2. **One vertical slice, end to end.** Build Module 1 (Live Queue & Check-in) as a
   real, working feature — API endpoints, the events table actually being written to,
   a real (even minimal) frontend reading from it. This validates the whole stack
   before any other module gets built on top of it.
3. **Then POS + a thin tax slice**, per the PRD phasing — these need to be correct
   from the first real transaction, not retrofitted.
4. **Then booking + communications.**
5. **Everything else** follows, per PRD §7.

**This is genuinely a multi-week-to-multi-month project for a small team**, not
something to complete in a single sitting. The recommended way to actually write
this code, file by file, with real testing and git commits along the way, is
**Claude Code** (or your own dev workflow) — not a chat conversation. This repo
scaffold is the handoff point.

## Local development (once you start writing application code)

```bash
docker compose up -d          # Postgres + Redis locally
cp .env.example .env          # fill in real values
# then, once apps/api has real content:
cd apps/api && npm install && npm run migrate && npm run dev
```
