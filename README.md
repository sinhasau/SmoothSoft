# Salon Platform

A multi-tenant salon/barbershop management platform — real-time queue management,
POS, staff/payroll, and BI, built around an event-sourced Postgres backend.

This repo is a **starting scaffold**, not a finished product. Everything in
`docs/` and `db/migrations/` reflects real design decisions already made;
everything in `apps/` is an empty shell waiting to be built out. See
"How to actually build this" below before writing any application code.

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

db/migrations/           8 sequential SQL migrations — the actual normalized schema.
                          Apply in numeric order (0001 → 0008). See db/README.md.

apps/web/                Next.js + React + TypeScript — owner/staff dashboard + public booking
apps/api/                NestJS — the core modular monolith (see architecture doc §2)
apps/ai-service/         Python/FastAPI — the one deliberately separate service (no-show
                          risk scoring, scheduling assist, review drafting — see §5)
apps/mobile/             React Native — staff app + client app (two separate apps, not one)

packages/shared-types/   TypeScript types shared between apps/web and apps/api
```

## What's actually been validated vs. what's still a mockup

Everything in `docs/` and `db/migrations/` is real design work — schema, indexes,
RLS policies, and architecture decisions that were reasoned through, not guessed at.

What does **not** exist yet, anywhere:
- Any running application code (apps/* are empty shells)
- Any real integration (Stripe, Twilio, QuickBooks, etc.) — all still just design intent
- Any deployed database — the migrations have never been run against a real Postgres instance
- Any auth/session layer — RLS policies exist but nothing sets `app.current_location_id` yet

A series of interactive HTML/JS prototypes were built and demoed conversationally
(Live Queue, Clients, Reports, Settings, an Owner cross-location dashboard) to validate
UX decisions before committing them to real code. Those aren't in this repo — they were
throwaway prototypes, not something to build on top of. Treat them as validated UX
reference, not as a codebase to port.

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
