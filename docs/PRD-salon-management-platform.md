# PRD — Salon/Barbershop Management Platform

**Positioning:** A Shortcuts Software competitor built around a genuinely accurate live queue, with the rest of the modules a shop owner needs to run the business end to end.
**Status (updated July 21, 2026):** Phases 1–3 now have working local vertical slices. Core queue, scheduling, client, appointment handoff, checkout, payroll reporting, public booking, and communication-outbox flows are implemented. Browser-tokenized Stripe/Square payment and processor-routed refund foundations are wired, but production credentials, webhooks, reconciliation, identity, and operational hardening remain launch gates.

---

## 1. Key features at a glance

This is the high-level list — what's being proposed across the whole platform, grouped by module, with build status.

| # | Module | Status | Headline features |
|---|---|---|---|
| 1 | **Live Queue & Check-In** | ✅ Pilot-ready | Real-time wait estimates, stale-entry handling, drag reorder, walk-in/appointment intake, clocked-in staff eligibility, reassignment, service corrections, undo and audit trail |
| 2 | **Shop Configuration** | ✅ Built (prototype) | Store hours, services & pricing, barber schedules, queue tuning, performance goals |
| 3 | **Scheduling & Online Booking** | ✅ Phase 3 slice | Staff scheduling, responsive multi-service public booking, collision recheck, confirmation code, operational appointment list and Floor check-in |
| 4 | **Staff Management & Payroll** | ✅ Phase 2 slice | Roster, schedules, compensation rules, payroll-ready staff revenue, immutable pay-run reviews, PDF/XLSX export; full HR lifecycle remains |
| 5 | **Point of Sale & Payments** | ✅ Phase 2 slice | Itemized checkout, service correction, products/inventory, tax, discount, tips, cash/manual/linked-processor configuration and refunds |
| 6 | **Client Relationship Management** | 🟡 Operational core | Profiles, contact details, history, notes, allergies, consent, rebooking and public-booking creation; loyalty/packages remain |
| 7 | **Reporting & Business Intelligence** | 🟡 Operational core | Dashboard, revenue, staff/pay, utilization, no-show, rebooking and tax reporting; forecasting/cohorts remain |
| 8 | **Client Communications** | ✅ Phase 3 outbox | Booking confirmations/reminders are durably queued and visible; provider delivery worker and campaign tooling remain |
| 9 | **Inventory & Retail** | 🟡 Operational core | Catalog, stock validation and decrement during checkout; purchasing and reorder automation remain |
| 10 | **Online Presence** | 🟡 Booking foundation | Public booking is live locally; branded shop pages, Google/Maps integration and review aggregation remain |
| 11 | **Admin, Roles & Compliance** | 🟡 Foundation | Role enforcement, employment status, license/document storage and renewal views exist; production identity, privacy controls and multi-location administration remain |
| 12 | **Tax & Financial Management** | 🟡 Reporting foundation | Sales tax, structured tips, pay-period records and tax-readiness guidance exist; withholding, filings, accounting sync and financial statements require integrations/deeper work |
| 13 | **Legal, Risk & Industry Compliance** | 🟡 Early foundation | Worker classification, credential records and sanitation reminders exist; policy evidence, waivers, insurance and broader safety workflows remain |

**Read this as a roadmap, not a backlog dump** — section 9 proposes a phased build order.

---

## 2. Vision

A shop owner should be able to run the entire business — the line at the door, the schedule, the money, the marketing, and the numbers — from one system, without stitching together a queue app, a separate booking site, a card reader, a spreadsheet for payroll, and a notebook for client notes.

## 3. Target users

| User | Role |
|---|---|
| Owner | Runs the business: money, staffing, growth, compliance |
| Manager | Day-to-day shop operations, staffing decisions, may not own the business |
| Barber/stylist | Works the chair; cares about their own schedule, clients, and earnings |
| Front desk | Manages the live queue and intake |
| Customer | Books, checks in, waits, pays, comes back |

---

## 4. Module details

### Module 1 — Live Queue & Check-In ✅ *(see `PRD-live-queue-checkin.md` for full detail)*
Real-time queue board, wait-time estimation, walk-in/appointment intake, staff status, undo-everything activity log. This is the wedge — the thing Shortcuts is worst at.

Unrecognized phone numbers now trigger new-client intake, including name, referral source and allergy flag. Walk-in staff choice is limited to clocked-in professionals; service choice can be corrected at start and completion.

### Module 2 — Shop Configuration ✅
Store hours, services/pricing, barber weekly schedules, queue-algorithm tuning, and shop-wide + per-barber performance goals. Built as a Settings tab feeding directly into Module 1's live behavior (e.g., appointment booking now respects actual barber schedules and store hours instead of hardcoded values).

### Module 3 — Scheduling & Online Booking ✅ Phase 3 slice
**Built:** internal schedules, public multi-service/professional/date/time booking, availability overlap protection, client upsert, confirmation code, communication outbox, operational appointment list, cancellation control and one-step Floor check-in.
**Not built:**
- Google Business Profile "Book" button integration
- Waitlist/notify-me for fully-booked days
- Recurring appointment support ("same time every 4 weeks")

### Module 4 — Staff Management & Payroll ✅ Phase 2 slice
**Built:** roster, weekly schedule, goals, compensation classifications/rules, scheduled hours, attributed service/retail/refund/tip totals, estimated pay, pay-review logs and PDF/XLSX exports.
**Not built:**
- Payroll export/integration (Gusto, ADP, ezPayroll, etc.)
- Time-off requests and approval
- Onboarding checklist for new hires (licensing, tax forms, profile setup)
- **Hiring/recruiting workflow** — job posting, applicant tracking, interview scheduling
- **Continuing education / license renewal tracking** — most states require CE hours to renew a cosmetology/barber license; this should link to Module 11's existing license-expiration tracking so a barber's CE progress and renewal deadline are visible together, not tracked separately
- **Performance reviews** — qualitative reviews alongside the quantitative goals-vs-actuals data Module 7 will produce
- **Disciplinary action tracking and offboarding checklist** — documented process for write-ups and terminations, which also matters for Module 13's worker-classification and non-compete concerns below
- **Benefits management** — health insurance enrollment, PTO accrual, for shops that offer them (mostly relevant to W-2 staff, not booth renters)

### Module 5 — Point of Sale & Payments ✅ Phase 2 slice
**Built:** itemized services/retail, authoritative product pricing/stock, service correction, requested-professional premium rules, tax, discounts, tips, cash/manual-card records, browser-tokenized Stripe/Square configuration, processor attribution and processor-routed refunds.
**Not built:**
- Production terminal credentials/webhook reconciliation and split tender
- Customer-delivered digital receipts (operator print receipts are built)
- Refunds and voids with manager approval
- Gift cards
- **Deposits and no-show fee enforcement** — a cancellation/no-show policy is only real if it can actually charge a card on file; this requires storing a payment method at booking time for appointments, which has its own privacy/PCI handling implications (see Module 13)

### Module 6 — Client Relationship Management 🟡
**Built:** first-class profiles, contact details, notes, history, allergy flag, referral source, consent capture and rebooking.
**Not built:**
- Segmentation (e.g. "hasn't been in 6+ weeks," "top spenders")
- Loyalty/rewards program
- Birthday/anniversary campaigns
- **Prepaid packages** (e.g. "10 haircuts, pay for 9") and **membership/subscription plans** (e.g. unlimited monthly haircuts) — both standard revenue models in this industry and both create deferred revenue, which Module 12 needs to account for correctly, not just Module 5 needs to sell
- **Gift cards** as a client-facing product (sold via Module 5, redeemed at checkout, balance tracked here)
- **Consultation/intake forms** — allergy disclosures and patch-test consent for color and other chemical services, captured once as part of the client profile rather than re-asked every visit; reduces liability exposure (see Module 13)
- **Client-data ownership policy** — an unresolved question, not just a missing feature: when a barber leaves the shop (employed or booth-rented), is the client history and contact info the shop's asset or the barber's? This needs a decision before the data model can be considered final. See open questions.

### Module 7 — Reporting & Business Intelligence 🟡
This is the direct payoff of the goals infrastructure already built in Module 2, split into two tiers: operational reporting (what happened) and business intelligence (what it means and what's next).

**Operational reporting built:** revenue, staff/pay, service mix, utilization, no-show/cancellation, rebooking, tax and wait-accuracy views. Payroll PDF/XLSX export and immutable review logs are included.

**Business intelligence remaining** — turns the reports above into decisions:
- Revenue: daily/weekly/monthly, by barber, by service, by payment type
- Utilization: chair time booked vs. available, against the utilization goal
- No-show and cancellation rate, by client and by barber
- Rebooking rate (did the client book their next visit before leaving)
- Tip rate vs. goal
- Wait-time accuracy (estimated vs. actual — this also validates whether Module 1's algorithm needs upgrading, see the algorithm spec)
- Per-barber performance vs. their individual goals (Module 2 already stores the targets; this is where they get compared to actuals)

**Business intelligence** — turns the reports above into decisions:
- Trend analysis over time (is a barber's clientele growing or shrinking; is a service's revenue seasonal)
- Cohort/retention analysis — client lifetime value, how long clients stay before churning, retention by acquisition source
- Revenue and staffing forecasting (e.g. "at current trend, do we need to hire by Q3")
- Anomaly detection / alerts (a sudden spike in cancellations, a barber's utilization dropping) surfaced to the owner rather than requiring them to go looking
- Marketing ROI — once Module 8 campaigns exist, tie spend to bookings/revenue generated
- Owner-facing executive summary dashboard — the two or three numbers that actually matter, on login, not a wall of charts
- Raw data export / BI-tool connectors (CSV export at minimum; Looker Studio, Power BI, or similar for shops that want to build their own views)

**Dependency note:** BI is only as good as the underlying event log. This is the strongest argument for prioritizing the event-sourced backend called out in the Live Queue PRD §9 — snapshot-based undo doesn't produce the clean event history that trend/cohort/forecasting features need.

### Module 8 — Client Communications ✅ Phase 3 outbox
- Automated appointment confirmations and reminders are queued and manager-visible; provider delivery/retry worker remains
- "You're next" / "your barber is ready" texts — a genuine Shortcuts-competitive feature given how good the live queue already is
- At-risk appointment alerts to staff (the `appt_atrisk_notify_minutes` setting already exists in Module 2 and has nowhere to fire yet)
- Post-visit review requests
- Marketing campaigns (promotions, new-service announcements)

### Module 9 — Inventory & Retail 🟡
- Product catalog, stock levels and atomic retail checkout are built
- Low-stock alerts and reorder suggestions
- Barber-attributed retail sales (feeds commission in Module 4)

### Module 10 — Online Presence 🟡 Booking foundation
- Public shop page (hours, services, staff, location) — the role the current `jjsbarbers.com` WordPress shell plays
- Google/Apple Maps and Business Profile sync
- Review aggregation and display (Google, Yelp)

### Module 11 — Admin, Roles & Compliance 🟡 Foundation
- Role-based owner, manager, professional and front-desk data/control boundaries are implemented locally; production identity and an automated endpoint authorization matrix remain
- License/document issue and expiration tracking, attachments, history access and renewal visibility are implemented; insurance templates and automated renewal delivery remain
- Data privacy/retention controls for client PII
- Multi-location support, if/when the business grows past one shop

### Module 12 — Tax & Financial Management 🟡 Reporting foundation
Depends heavily on Module 4 (Staff/Payroll) and Module 5 (POS/Payments) for source data, and on the business's legal structure and how staff are classified (see open questions below).

**Tax compliance:**
- **Sales tax:** calculate and track by jurisdiction, correctly distinguishing taxable services vs. taxable retail product where local law differs; multi-jurisdiction support if Module 11's multi-location ever ships. Generates the periodic report a shop needs to remit sales tax (monthly/quarterly/annual, per local requirement).
- **Payroll tax:** withholding for W-2 staff (federal, state, local, FICA), employer-side tax liability tracking.
- **Contractor/booth-renter tax:** 1099-NEC generation for anyone not on payroll — directly tied to the commission/booth-rent model decided in Module 4.
- **Tip reporting:** tips are taxable income and the IRS holds the business responsible for tracking and reporting them; needs to capture tips at the point they're recorded (already partially captured today in Module 1's Complete flow as a free-text field, which isn't sufficient for real tax reporting — this needs to become a structured, per-employee, per-period total).
- **Year-end documents:** W-2s for employees, 1099-NEC for contractors, 1099-K reconciliation against whatever payment processor Module 5 uses.
- **Estimated tax support for the owner:** quarterly income summaries formatted for estimated tax payments, not just raw revenue.
- **Expense/COGS tracking:** product cost basis (ties to Module 9 inventory) so retail profit, not just retail revenue, is calculable.
- **Accounting software sync:** two-way or export-only integration with QuickBooks/Xero rather than rebuilding general ledger accounting from scratch.
- **Audit-ready records:** the IRS generally expects 3–7 years of retained records; this is a records-retention requirement on top of whatever Module 11 already sets for client data, and argues for the event-sourced backend (see Live Queue PRD §9) being treated as the financial system of record, not just a UI convenience.

**Financial management (running the business day to day, not just staying compliant):**
- **Profit & loss statements** — the owner needs this more often than tax filing deadlines
- **Budgeting** — planned vs. actual spend by category (rent, supplies, payroll, marketing)
- **Cash flow forecasting** — especially important given the seasonal/day-of-week volatility common in this business
- **Owner's draw tracking** — for sole prop/LLC structures where the owner isn't on payroll
- **Break-even analysis** — how many services/day/barber the shop needs to cover fixed costs, which ties directly back to the goals infrastructure already built in Module 2

**This module should not be built as original tax logic.** Tax rate tables, filing rules, and forms change constantly and vary by jurisdiction — the practical path is integrating a tax-calculation provider (e.g. Avalara, TaxJar) for sales tax and a payroll provider (Gusto, ADP, Justworks, etc.) for payroll tax/withholding/W-2/1099 generation, rather than the platform maintaining that logic itself. The financial-management features above are more reasonable to build natively, since they're mostly reporting over data Modules 1, 2, 4, 5, and 9 already produce — closer to Module 7 (BI) than to tax computation.

### Module 13 — Legal, Risk & Industry Compliance 🟡 Early foundation
This module exists because a few risks in this specific industry are common enough, and expensive enough when they go wrong, that the platform should actively help the owner manage them rather than leave them to a filing cabinet.

- **Worker classification risk** — booth rental is extremely common in barbershops/salons, and the IRS and state labor departments actively audit this industry for misclassifying employees as independent contractors (or the reverse) to avoid payroll tax. This is the single highest-risk item in this entire document. The platform should: (a) make the classification an explicit, documented choice per staff member rather than an implicit side effect of how they're paid, (b) surface the DOL/IRS classification criteria at the point that choice is made, and (c) keep the supporting evidence (contracts, schedule control, tool ownership, etc.) attached to that staff record for audit defense.
- **Client-data ownership policy** — see Module 6. Needs a decision, then a contract (see non-compete below) and a data-model consequence.
- **Non-compete / non-solicitation contract tracking** — attach the actual signed agreement to a staff record, with an expiration/geographic-scope field, since these disputes are common when a stylist with a loyal clientele leaves.
- **Insurance tracking** — general liability, workers' comp (for W-2 staff), professional/malpractice liability (a chemical burn or allergic reaction from a service is a real claim), and proof-of-insurance collection from booth renters who carry their own policy. Extends Module 11's existing license-expiration tracking to insurance policies with the same renewal-alert pattern.
- **Health & safety / sanitation compliance** — tool sterilization logs, sharps disposal records, and safety data sheets for chemical products, which many state cosmetology/barber boards require to be kept and produced on inspection.
- **Consultation and liability waivers** — patch-test and chemical-service consent capture (see Module 6), retained per client for liability defense, not just as a courtesy.
- **PCI/payment data handling** — once Module 5 stores a card on file for deposits/no-show fees, that's a compliance obligation (PCI-DSS), not just a feature; likely resolved by using a processor that tokenizes and never lets the platform touch raw card data, but needs to be an explicit decision, not an accident.

---

## 5. Non-functional requirements

- **Tablet-first, works with a mouse or touch** — the live queue is the primary shared-device surface; Settings and reporting can assume a manager on a laptop.
- **Resilient to flaky connectivity** — a shop floor tablet shouldn't lose the queue state over a dropped wifi connection; needs offline-tolerant sync once there's a real backend.
- **Multi-device concurrency** — several staff editing the same queue simultaneously (this is explicitly out of scope for the current in-memory prototype and is called out in the Live Queue PRD §9).
- **Data ownership/portability** — an owner should be able to export their client list, revenue history, and staff data if they leave the platform.

## 6. Explicitly out of scope (for now)

- Franchise/enterprise multi-tenant management above the multi-location case in Module 11
- Native mobile apps (assume responsive web first)
- Booth-rental sub-leasing marketplace features

## 7. Delivery status and next phasing

1. **Completed locally — Phase 1:** durable multi-tenant queue, real-time synchronization, event/audit history, client intake, staff eligibility and a simplified operator interface.
2. **Completed locally — Phase 2:** itemized checkout, canonical product inventory, requested-professional pricing protection, configurable manual/linked card mode, tips/tax/discounts/refunds, compliance records, payroll-ready reporting, review snapshots and PDF/XLSX exports.
3. **Completed locally — Phase 3:** responsive public booking, schedule-aware availability, collision protection, client creation/update, confirmation codes, and a durable confirmation/reminder outbox with manager visibility.
4. **Next — launch hardening (recommended):** upgrade vulnerable framework dependencies; add production identity/session management, rate limiting and bot protection; connect one payment processor and one SMS/email provider; add background delivery/retry/dead-letter processing; complete timezone/DST test coverage; add observability, backups, restore drills, accessibility checks and CI browser tests.
5. **After a controlled pilot:** deposits/cancellation policy, receipt delivery, low-stock/reorder workflows, payroll-provider handoff, accounting export, loyalty/packages, forecasting and multi-location controls. Prioritize these from measured pilot pain, not assumed demand.

### Latest E2E audit closure

- Floor now exposes one state-aware store action at a time (open, close, or reopen) and records the location-local business date.
- Public/client rebooking supports multiple services and professional-aware availability; appointments have a staff-facing list and explicit Floor handoff.
- Staff can view only their own private employment details. Coworker compensation, documents, tax identity, labor cost, payroll burden and manager schedule controls are withheld.
- Front-desk access is operational: Floor, appointments, clients, schedule, messages and read-only receipt review are available without granting reports, settings or refund authority. Front-desk staff never count as chairs or appear as service matches.
- Revenue-by-staff distinguishes money payable to staff from booth rent due to the shop; negative settlements are no longer presented as negative wages.
- Business-day reporting, receipt numbering and open/close records use each location’s timezone rather than the server’s UTC date.
- Production builds no longer depend on downloading Google Fonts.

### Phase acceptance boundaries

“Completed locally” means the product workflow and durable data model exist and pass local build/type/unit/manual E2E checks. It does **not** mean the system is ready for unattended production money movement or regulated payroll/tax filing. Those require the provider integrations and hardening in step 4.

## 8. Open questions for the owner

1. Booth rent vs. commission vs. hybrid — which model(s) does the shop actually use? This determines Module 4's design and, downstream, whether staff get W-2s or 1099s in Module 12 — and it's the direct input to Module 13's worker-classification risk assessment.
2. Which payment processor, if any, is already in use or preferred?
3. Is single-location the right assumption for the next 12 months, or should Module 11's multi-location support be pulled forward?
4. What SMS/email provider (if any) is preferred for Module 8, given deliverability and cost trade-offs?
5. What's the business's legal structure (sole prop, LLC, S-corp)? Affects how Module 12 handles owner estimated-tax support specifically.
6. Which state(s)/jurisdiction(s) does the shop operate in, and does that jurisdiction tax services, retail, or both? Determines whether Module 12 needs a sales-tax provider from day one or can defer it.
7. Is there an existing bookkeeper/accountant and accounting software already in use? Determines whether Module 12 needs to build toward QuickBooks/Xero specifically or something else.
8. Any preference between a payroll/tax provider the owner already uses personally or elsewhere, vs. the platform recommending one?
9. **Client-data ownership** — if a barber leaves, does their client list and history stay with the shop, or leave with them? This needs an actual policy decision (Module 6/13), ideally backed by a written agreement each barber signs at onboarding.
10. Does the shop currently carry general liability, workers' comp, and professional liability insurance, and are booth renters (if any) required to carry their own? Determines how much of Module 13's insurance tracking is "record what exists" vs. "help the owner get compliant first."
11. Do any current services (color, chemical treatments) already use a consultation/patch-test process, even informally? Determines whether Module 13's waiver capture is formalizing an existing habit or introducing a new one.
