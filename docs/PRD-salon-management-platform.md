# PRD — Salon/Barbershop Management Platform

**Positioning:** A Shortcuts Software competitor built around a genuinely accurate live queue, with the rest of the modules a shop owner needs to run the business end to end.
**Status:** Module 1 built as an interactive prototype. Everything else in this document is scoped but not built.

---

## 1. Key features at a glance

This is the high-level list — what's being proposed across the whole platform, grouped by module, with build status.

| # | Module | Status | Headline features |
|---|---|---|---|
| 1 | **Live Queue & Check-In** | ✅ Built (prototype); 🟡 new-client onboarding at check-in identified as a gap | Real-time wait estimates, drag-reorder queue, walk-in/appointment intake, staff status board, inline undo, full audit trail |
| 2 | **Shop Configuration** | ✅ Built (prototype) | Store hours, services & pricing, barber schedules, queue tuning, performance goals |
| 3 | **Scheduling & Online Booking** | 🟡 Partially built | Store hours/barber schedules exist internally; customer-facing booking site/flow not built |
| 4 | **Staff Management & Payroll** | 🟡 Partially built | Roster + schedule + goals exist; full HR lifecycle (hiring, CE/license tracking, discipline, offboarding) and commission/payroll calculation not built |
| 5 | **Point of Sale & Payments** | ❌ Not built | Checkout, card processing, tipping, receipts, refunds, deposits & no-show fee enforcement |
| 6 | **Client Relationship Management** | 🟡 Partially built | Per-client notes/history exist; no packages/memberships/gift cards, no marketing/loyalty, client-data ownership undecided |
| 7 | **Reporting & Business Intelligence** | ❌ Not built | Revenue/utilization/no-show/rebooking reports, trend & cohort analysis, forecasting, owner dashboard, BI-tool export |
| 8 | **Client Communications** | ❌ Not built | Appointment reminders, wait-time texts, marketing campaigns, review requests |
| 9 | **Inventory & Retail** | ❌ Not built | Product stock, retail sales, reorder alerts |
| 10 | **Online Presence** | ❌ Not built | Public booking page, Google/Maps integration, review aggregation |
| 11 | **Admin, Roles & Compliance** | ❌ Not built | User permissions, license/insurance tracking, data privacy, multi-location |
| 12 | **Tax & Financial Management** | ❌ Not built | Sales tax by jurisdiction, W-2/1099 generation, tip reporting, payroll tax withholding, accounting software sync, P&L/budgeting/cash flow, owner's draw tracking |
| 13 | **Legal, Risk & Industry Compliance** | ❌ Not built | Worker classification risk documentation, liability/workers-comp/booth-renter insurance tracking, sanitation & chemical-safety logs, consultation/patch-test waivers, non-compete tracking |

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

**Gap identified:** check-in currently treats an unrecognized phone number as just a display string for the queue, not a trigger to actually create a client record. See `PRD-live-queue-checkin.md` §5.4 for the proposed new-client intake flow, which ties into Module 6 (client profile as a first-class object) and Module 13 (consultation/waiver capture where a service requires it).

### Module 2 — Shop Configuration ✅
Store hours, services/pricing, barber weekly schedules, queue-algorithm tuning, and shop-wide + per-barber performance goals. Built as a Settings tab feeding directly into Module 1's live behavior (e.g., appointment booking now respects actual barber schedules and store hours instead of hardcoded values).

### Module 3 — Scheduling & Online Booking 🟡
**Built:** internal store hours and barber schedules (Module 2), which are the data online booking would need to consume.
**Not built:**
- Public-facing booking page/flow (a customer picks a service, barber, date, time — no staff involvement)
- Google Business Profile "Book" button integration
- Waitlist/notify-me for fully-booked days
- Recurring appointment support ("same time every 4 weeks")

### Module 4 — Staff Management & Payroll 🟡
**Built:** roster, per-barber weekly schedule, per-barber goals (Module 2).
**Not built:**
- Commission/booth-rent calculation rules (percentage of service, percentage of retail, flat booth rent, or hybrid)
- Payroll export/integration (Gusto, ADP, ezPayroll, etc.)
- Time-off requests and approval
- Onboarding checklist for new hires (licensing, tax forms, profile setup)
- **Hiring/recruiting workflow** — job posting, applicant tracking, interview scheduling
- **Continuing education / license renewal tracking** — most states require CE hours to renew a cosmetology/barber license; this should link to Module 11's existing license-expiration tracking so a barber's CE progress and renewal deadline are visible together, not tracked separately
- **Performance reviews** — qualitative reviews alongside the quantitative goals-vs-actuals data Module 7 will produce
- **Disciplinary action tracking and offboarding checklist** — documented process for write-ups and terminations, which also matters for Module 13's worker-classification and non-compete concerns below
- **Benefits management** — health insurance enrollment, PTO accrual, for shops that offer them (mostly relevant to W-2 staff, not booth renters)

### Module 5 — Point of Sale & Payments ❌
- Checkout flow that turns "Complete" (currently a free-text charge/tip field) into a real transaction: itemized services + retail, tax, discounts, tips, split payment
- Card processing integration (Square, Stripe Terminal, or similar)
- Digital + printed receipts
- Refunds and voids with manager approval
- Gift cards
- **Deposits and no-show fee enforcement** — a cancellation/no-show policy is only real if it can actually charge a card on file; this requires storing a payment method at booking time for appointments, which has its own privacy/PCI handling implications (see Module 13)

### Module 6 — Client Relationship Management 🟡
**Built:** per-client general notes and service history (Module 1), captured at Start/Complete.
**Not built:**
- Client profiles as a first-class object (contact info, preferences, allergy/sensitivity flags, referral source) — currently a check-in with an unrecognized phone number just becomes a display string, not a real profile; see Module 1's identified gap
- Segmentation (e.g. "hasn't been in 6+ weeks," "top spenders")
- Loyalty/rewards program
- Birthday/anniversary campaigns
- **Prepaid packages** (e.g. "10 haircuts, pay for 9") and **membership/subscription plans** (e.g. unlimited monthly haircuts) — both standard revenue models in this industry and both create deferred revenue, which Module 12 needs to account for correctly, not just Module 5 needs to sell
- **Gift cards** as a client-facing product (sold via Module 5, redeemed at checkout, balance tracked here)
- **Consultation/intake forms** — allergy disclosures and patch-test consent for color and other chemical services, captured once as part of the client profile rather than re-asked every visit; reduces liability exposure (see Module 13)
- **Client-data ownership policy** — an unresolved question, not just a missing feature: when a barber leaves the shop (employed or booth-rented), is the client history and contact info the shop's asset or the barber's? This needs a decision before the data model can be considered final. See open questions.

### Module 7 — Reporting & Business Intelligence ❌
This is the direct payoff of the goals infrastructure already built in Module 2, split into two tiers: operational reporting (what happened) and business intelligence (what it means and what's next).

**Operational reporting** — needed regardless of shop size:
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

### Module 8 — Client Communications ❌
- Automated appointment confirmations and reminders (SMS/email)
- "You're next" / "your barber is ready" texts — a genuine Shortcuts-competitive feature given how good the live queue already is
- At-risk appointment alerts to staff (the `appt_atrisk_notify_minutes` setting already exists in Module 2 and has nowhere to fire yet)
- Post-visit review requests
- Marketing campaigns (promotions, new-service announcements)

### Module 9 — Inventory & Retail ❌
- Product catalog and stock levels
- Retail sales through the POS (Module 5)
- Low-stock alerts and reorder suggestions
- Barber-attributed retail sales (feeds commission in Module 4)

### Module 10 — Online Presence ❌
- Public shop page (hours, services, staff, location) — the role the current `jjsbarbers.com` WordPress shell plays
- Google/Apple Maps and Business Profile sync
- Review aggregation and display (Google, Yelp)

### Module 11 — Admin, Roles & Compliance ❌
- Role-based permissions (owner, manager, barber, front desk — not everyone should see revenue or edit settings)
- License and insurance expiration tracking per barber, with renewal alerts
- Data privacy/retention controls for client PII
- Multi-location support, if/when the business grows past one shop

### Module 12 — Tax & Financial Management ❌
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

### Module 13 — Legal, Risk & Industry Compliance ❌
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

## 7. Suggested phasing

1. **Now:** Finish Module 1/2 backend (real persistence, multi-device sync, event-sourced undo) — the prototype needs to survive a real shop before anything else matters, and an event-sourced backend is also the foundation Module 12 (Tax) and Module 7 (BI) both need. Also resolve Module 13's worker-classification question now, on paper, independent of software — it's a legal risk today, not a future feature.
2. **Next:** Module 5 (POS/Payments) and Module 4's payroll piece, built together with a thin slice of Module 12 (Tax) — sales tax and tip capture need to be correct from the first real transaction, not retrofitted. Pull forward Module 13's consultation/waiver capture and insurance tracking alongside this, since they're cheap to build and the liability exposure exists from day one, not just at scale. Basic Module 7 operational reporting rides along, since it's mostly querying data these modules already produce.
3. **Then:** Module 3 (online booking) and Module 8 (communications) — the highest-leverage growth/retention features and the most direct Shortcuts-competitive differentiators. Module 1's new-client onboarding gap (see §4, Module 1) is worth fixing in this phase too, since it's the moment a client profile is actually created and everything in Module 6 depends on that data existing.
4. **Later:** Module 12's deeper tax integrations (accounting sync, year-end forms, provider integrations) and financial-management reporting, Module 7's full BI layer (forecasting, cohorts, anomaly detection), Module 4's remaining HR lifecycle (hiring, reviews, benefits), Module 6's packages/memberships/loyalty depth, Module 9 inventory, Module 10 online presence, Module 11 compliance/multi-location, and Module 13's remaining lower-urgency items (non-compete contract tracking, PCI formalization) — valuable, but the business can run without them longer than it can run without 1–3 above.

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
