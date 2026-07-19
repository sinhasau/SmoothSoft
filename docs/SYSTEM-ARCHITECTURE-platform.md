# System Architecture — Platform at Scale

**Scope:** 10,000 salons, ~100,000 daily appointments, mobile apps, payments, AI features, HIPAA-like privacy posture. Builds directly on `ARCHITECTURE-data-and-perspectives.md` (multi-tenant Postgres + RLS, event sourcing, roles) — this document adds the layers above and around that data architecture: frontend, backend services, cloud infrastructure, third-party integrations, AI, and privacy.

---

## 0. Scale sanity check, before designing anything

100,000 appointments/day, plus roughly 3–5 events per appointment across its lifecycle (booked, reminder sent, checked in, started, completed/transaction) puts the event log at **300,000–500,000 events/day**, averaging 3.5–6/sec but concentrated into local business hours — realistically a sustained **50–100 events/sec peak** platform-wide once you account for timezone spread being only partial (US-centric, so peaks overlap heavily 9am–7pm across a few timezones rather than smoothing out globally).

Staff devices (3–5 per shop) plus active client sessions put concurrent WebSocket connections in the **tens of thousands** at peak.

**This is squarely within reach of Postgres + Redis + a horizontally-scaled application tier — no need for Kafka-scale streaming or a microservices split at this stage.** The design below says explicitly where that changes if the platform grows an order of magnitude past this.

---

## 1. Frontend

### Web — owner/manager/staff dashboard + public client booking site
- **Next.js (App Router) + React + TypeScript.** SSR/ISR for the public booking pages — SEO genuinely matters here, since client discovery (a Booksy/Vagaro strength) is a real competitive vector; CSR for the authenticated staff app where SEO is irrelevant and interactivity matters more.
- **Tailwind**, with a component library (e.g. shadcn/ui) for consistency across the already-scoped screens (queue, clients, reports, settings).
- **State/data layer:** TanStack Query for server state with optimistic updates — critical for the live queue to feel instant — backed by a WebSocket subscription layer that invalidates the query cache in real time rather than polling.
- **Multi-tenant theming:** a per-organization theme config (logo, colors) rather than separate deployments per tenant — white-label-lite, not white-label-heavy.

### Mobile
- **React Native**, not Flutter — the deciding factor is team leverage: TypeScript end-to-end, shared types with the web app via a monorepo (Turborepo), easier hiring overlap with the Next.js team. Flutter is a legitimate alternative if the org is Dart-inclined already; this is a close call resolved by team fit, not a technical requirement.
- **Two distinct apps, not one:** a **Staff app** (queue, check-in, checkout — built for a mounted or handheld shop tablet) and a **Client app** (booking, live wait status, loyalty, payment methods). Different jobs, different UX, shouldn't be one app with a mode switch.
- **Offline-first for the Staff app specifically** — local SQLite/WatermelonDB cache with event-queue replay, matching the offline-resilience requirement already designed into the data architecture (a shop floor tablet cannot lose the queue over a dropped wifi connection).

---

## 2. Backend

### Service architecture: modular monolith, not microservices — with one deliberate exception
- **NestJS (TypeScript)** over FastAPI for the core platform. Reasoning: TypeScript end-to-end with the frontend (shared types via the monorepo), and NestJS's module system maps directly onto the domain modules already scoped in the platform PRD — Queue, Clients, POS, Staff/Payroll, Reports, Settings, Tax, Compliance each become a Nest module with a clean boundary, ready to extract into its own service later if a specific one ever needs to scale independently.
- **At this scale, a monolith is the right call, not a compromise.** 10,000 tenants and 100,000 daily appointments is comfortably handled by a well-indexed Postgres primary plus a horizontally-scaled Nest app behind a load balancer. Microservices would add real operational overhead (service discovery, distributed tracing, deployment coordination) without a scale problem that justifies it yet.
- **The one component split out from day one: the AI service** (Section 5). Different scaling profile (inference/GPU vs. CPU/IO), different natural language ecosystem (Python for ML tooling), different deploy cadence. This is a genuine service boundary, not an arbitrary one — everything else stays in the monolith until it earns its own service.
- **API layer:** REST for standard CRUD (simplest client generation, easiest third-party integration story) + a WebSocket gateway (Nest's built-in support) for the live queue and other real-time surfaces, backed by Redis pub/sub so events fan out correctly across multiple horizontally-scaled app instances.

### Data layer
- **PostgreSQL**, exactly as designed in the prior architecture doc: multi-tenant via `organization_id`/`location_id` + Row-Level Security, with the append-only `events` table as the actual source of truth for the queue, undo, and audit trail.
- **Redis:** session cache, WebSocket pub/sub fan-out, rate limiting, and the backing store for background jobs (BullMQ — a natural fit in the Nest ecosystem) handling reminders, payroll exports, review requests, and triggering AI inference.
- **Read replicas** for Reports/BI queries once dashboard load starts competing with the live queue for primary-DB latency — BI reads should never be able to slow down a checkout.

### Event-driven architecture, concretely
Two consumption patterns off the same `events` table:
1. **Synchronous projection** — the live queue view is built by folding recent events for the requesting location, read directly for immediate UI consistency.
2. **Asynchronous fan-out** — an outbox-style pattern publishes the same events to a Redis-backed job queue, decoupling reminders, review requests, BI aggregation, and AI triggers from the request path, so a slow downstream consumer can never block a checkout or check-in.

Still Postgres + Redis, deliberately not Kafka. **The threshold for revisiting that:** an order-of-magnitude jump in event volume (large enterprise chains, sub-second cross-service fan-out requirements) — not a concern at 10,000-salon scale.

---

## 3. Cloud & infrastructure

| Layer | Choice | Why |
|---|---|---|
| Provider | AWS | Most mature managed-Postgres options (RDS/Aurora), broadest well-trodden path for the specific integrations needed below. GCP is a legitimate alternative (stronger native ML tooling) — a close call, not a hard requirement. |
| Compute | Docker containers on ECS Fargate | Lower operational overhead than self-managed EKS/Kubernetes at this scale; revisit only if the team already carries k8s expertise in-house. |
| Database | Aurora Postgres, with a read replica for BI | Automated backups + point-in-time recovery (supports the audit-retention requirement), encryption at rest by default. |
| Object storage | S3 | Waivers, license documents, consultation photos — referenced by URL from Postgres, never stored inline (per the data architecture doc). |
| CDN | CloudFront | In front of the public booking pages and static assets. |
| CI/CD | GitHub Actions | Build/test → deploy to ECS (rolling or blue/green); separate pipelines for the web app, the AI service, and mobile builds (EAS for React Native). |
| Observability | Structured logging + APM (e.g. Datadog) from day one | The live queue's entire value proposition is speed — latency regressions need to be caught by monitoring, not discovered from complaints. |
| Multi-region | Not needed yet | Single-region (e.g. us-east-1), multi-AZ, is sufficient for a US-centric 10,000-salon scale. Revisit only if international expansion becomes real. |

---

## 4. Integrations

| Integration | Pattern | Where it plugs in |
|---|---|---|
| **Stripe** | **Stripe Connect**, not plain Stripe — the multi-tenant, multi-payee structure (individual booth renters and locations each need their own payout) is exactly what Connect is built for, with an optional platform fee. Card data tokenized entirely client-side via Stripe.js/Elements — raw card numbers never reach the backend, satisfying the PCI point already flagged in the data architecture doc. | Webhooks (payment succeeded, disputed, payout) land as events in the same event-sourced pipeline as everything else. |
| **Twilio** | SMS for reminders, "you're next" live-queue texts, and OTP verification for the cross-org client identity design. | Delivery-status webhooks feed retry/fallback logic in the communications module. |
| **Google Calendar** | Two-way sync, OAuth **per staff member**, not per organization — this is a personal convenience, not a shop-wide setting. | Staff schedule view; doesn't touch the queue engine itself. |
| **Instagram / Facebook booking** | Meta's Booking/Click-to-Book API, surfacing the platform's public booking flow inside a shop's Instagram/Facebook business profile. | Matters disproportionately in this industry — client discovery for stylists is heavily Instagram-driven; this is a real acquisition channel, not a checkbox integration. |
| **QuickBooks** | QuickBooks Online API — scheduled or near-real-time sync of transactions and payroll summaries, mapped to the org's chart of accounts. | The Tax & Financial Management module's "integrate, don't rebuild" principle, already established in the platform PRD. |

---

## 5. AI features

Grounded in the existing product surface rather than generic AI-washing — each one ties to a real workflow already scoped:

- **No-show risk scoring** — an explainable model over existing event-log data (a client's own no-show/cancel history, booking lead time, day/time patterns) flags at-risk appointments for a deposit requirement or an extra reminder. Directly extends differentiator D (privacy-safe identity) and the deposits/no-show-fee feature from the platform PRD.
- **Smart scheduling assist** — suggests appointment slots that reduce gaps in a stylist's day, a genuine chair-utilization optimization problem tied to the utilization goal already tracked in Reports.
- **Review response drafting** — AI-drafted responses to client reviews for the owner to approve, never auto-posted — a human stays in the loop given the reputational stakes.
- **Consultation note summarization** — turns a stylist's freeform service notes into structured, searchable tags over time, useful for service quality now and BI later.

**Architecture implication:** a separate **AI service (Python/FastAPI)** — the one deliberate exception to the "modular monolith" rule above — consuming events asynchronously off the job queue and writing results back as new event types, rather than sitting in the synchronous request path. An AI inference slowdown or failure should never be able to block a checkout or check-in.

---

## 6. Privacy & HIPAA-like standards

Salon data isn't literally HIPAA-covered (not a covered entity), but allergy flags and consultation notes (platform PRD Module 13) are genuinely health-adjacent, and the right posture treats them that way regardless of the strict legal requirement:

- **Encryption at rest** (RDS/S3 default) and **in transit** (TLS everywhere) as a baseline.
- **Field-level encryption specifically for the most sensitive fields** — allergy flags, consultation notes — beyond blanket at-rest encryption, so a database-level breach doesn't trivially expose health-adjacent data in plaintext.
- **Access logging on reads of sensitive fields**, not just writes — who viewed a client's allergy/consultation record, and when, as its own event type. This gives the audit trail HIPAA-like handling would expect, even where the legal framework doesn't strictly require it.
- **Data minimization by default** — don't collect health-adjacent data at all unless a chemical/consultation service actually requires it; opt-in per client, not blanket collection at signup.
- **Right-to-delete / data export tooling** for clients, consistent with GDPR/CCPA-style expectations even outside jurisdictions that strictly mandate it — increasingly a baseline client expectation regardless of the legal floor.

This entire section builds on, rather than duplicates, the RLS-based tenant isolation already designed — the same mechanism keeping Organization A from ever seeing Organization B's data is the foundation this extends, with row/field-level access logging added specifically for the most sensitive columns.

---

## 7. What's deliberately not here yet

- **Microservices beyond the AI service** — not justified at this scale; see Section 2.
- **Multi-region infrastructure** — not justified at this scale; see Section 3.
- **Kafka/streaming platform** — Postgres + Redis handles the event volume calculated in Section 0 with room to spare.
- **A dedicated search service (Elasticsearch, etc.)** — Postgres full-text search remains sufficient at this scale, per the original data architecture doc.

Each of these has an explicit trigger condition noted above for when to revisit — the goal is to name the right architecture for 10,000 salons today, not to over-build for a scale the platform hasn't reached.
