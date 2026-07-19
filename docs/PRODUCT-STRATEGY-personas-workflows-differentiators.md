# Product Strategy — Personas, Workflows, Differentiators

**Positioning:** A salon/barbershop platform competing with Vagaro, GlossGenius, Booksy, Mindbody, Boulevard, and Shortcuts Software — built around a genuinely accurate live queue and a set of underserved problems the incumbents either ignore or treat as an afterthought.

---

## Part 1 — Core personas

| Persona | Primary goal | What existing tools get wrong for them |
|---|---|---|
| **Salon owner** | Grow revenue, retain staff, avoid legal/financial exposure, see the business clearly | Reporting is generic (not salon-specific KPIs like chair utilization or rebooking rate); multi-location rollups are bolted on; nothing helps them get worker classification right, which is the single biggest legal risk in this industry |
| **Front desk receptionist** | Move the line, check people in/out fast, keep the schedule sane | Booking-first tools are slow for walk-in-heavy shops; checkout is clunky; no live wait-time visibility to hand to a waiting customer |
| **Stylist / barber (W-2)** | See their own book, clients, tips, and earnings without noise from the rest of the shop | Most tools show everyone's data mixed together, or force a shop-wide view even for someone who just wants "my day" |
| **Independent booth renter (1099)** | Run their micro-business inside the shop — their clients, their schedule, their money — with minimal shop control | Nearly every platform treats booth renters like employees: rigid shop-controlled scheduling, no data portability, no separation from the shop's financial reporting — which actively undermines their contractor status |
| **Client / customer** | Book easily, know the real wait, get reminded, rebook without friction | Booking apps rarely show real wait times; rescheduling is phone tag; loyalty and rebooking are afterthoughts |
| **Accountant / admin** | Clean, reconcilable financial and payroll data — nothing front-of-house | Has to manually reconcile POS exports against accounting software; tip reporting is inconsistent; 1099 vs. W-2 recordkeeping is manual and audit-fragile |

The **booth renter** and **accountant/admin** personas are the two most underserved in the market today, and not coincidentally the two most directly addressed by the Legal & Risk and Tax & Financial Management modules already scoped in the platform PRD.

---

## Part 2 — Core workflows

Each workflow below names the personas involved and the system state it touches (referencing the event-sourced architecture already designed).

### Client books appointment online
1. Client opens the public booking page (or an app), picks service, date/time, optionally a specific stylist.
2. System filters available slots by **actual staff schedule + store hours** (already the model built for internal appointment booking — this workflow just exposes it externally).
3. New/unrecognized client → lightweight identity capture (name, phone) creating a **local client profile**, not a full account.
4. Deposit charged if the shop's no-show policy requires one (ties to POS/payments).
5. Confirmation sent; an `appointment_booked` event is appended, driving both the shop's live view and the client's own booking history.

### Stylist manages schedule
1. Stylist (W-2 or 1099) opens their schedule view — scoped to their own `location_staff` assignment(s), including multiple locations if the org toggle is enabled.
2. Sets working hours/days (feeds the same `schedule` object that already gates appointment booking).
3. Requests time off; if a Manager permission requires approval, it routes there — otherwise self-service, depending on the org's `permission_overrides` configuration.
4. Booth renters get **their own scheduling surface** with no shop-imposed defaults beyond what the actual rental agreement specifies — a deliberate contrast to how competitors handle this persona (see Part 3).

### Automated reminders
1. `appointment_booked` (or `rescheduled`) event triggers a reminder job at a configurable lead time.
2. SMS/email sent via a communications provider (Module 8) — confirmation, then a day-of reminder, then optionally a "you're next" text once the queue engine (Module 1) has them close to being called, which is a genuinely differentiated moment competitors don't have since they don't run a live queue at all.
3. No-show risk: if the client has a history of no-shows (tracked from the transaction/cancellation event log), the reminder cadence or deposit requirement can adapt — see Part 3, differentiator D.

### Checkout + tips
1. Stylist/front desk opens Checkout (built as the POS module) for the client in-chair.
2. Itemized service + optional retail products, tax computed per the location's tax config, tip entered, payment captured (tokenized, never raw card data — architecture Part 1.5).
3. `transaction_recorded` event appended — append-only, feeding Reports, tax reporting, and per-stylist earnings in the same motion.
4. Structured tip capture here is what makes tip reporting (a real IRS obligation) actually usable later, instead of a free-text afterthought.

### Memberships / packages
1. Client purchases a package ("10 haircuts, pay for 9") or membership (recurring monthly plan) — a `transaction` with a distinct `type` that creates a **deferred-revenue balance** on the client's profile, not just a one-time sale.
2. Each future visit draws down the balance instead of charging full price; the draw-down is its own event, keeping the balance auditable.
3. Deferred revenue recognition feeds the Tax & Financial Management module's P&L correctly — packages sold this month but redeemed next month shouldn't overstate this month's recognized revenue.

### Inventory usage
1. Retail sale (already built into Checkout) decrements `products.stock` — straightforward.
2. Back-bar usage (product consumed *during* a service, not sold) is the part competitors usually skip: a service can optionally log product consumption, which feeds two things — reorder alerts (Module 9) and true service cost/margin (Module 12's COGS tracking), not just retail margin.

### Commission calculations
1. Already built: per-transaction, split by the stylist's `classification` — W-2 gets `commission_pct` of (service + retail) plus their tips; 1099 keeps everything and owes booth rent separately.
2. Runs live off the event log (Reports module), not a batch job — an owner can see today's accruing commission at 2pm, not just at close.
3. Feeds directly into the payroll export below.

### Payroll exports
1. At the pay-period boundary, the system aggregates commission/hours (W-2) into a structured export for a payroll provider (Gusto/ADP-style integration, per the Tax module's "integrate, don't rebuild" principle).
2. 1099 booth renters are explicitly excluded from payroll and instead flow into 1099-NEC generation at year-end, sourced from the same transaction/booth-rent data but through a different pipeline — keeping the classification distinction structural, not just cosmetic.

### Reviews / referrals
1. Post-checkout, a review request goes out (Module 8) — timed to land after the service, not generically scheduled.
2. Referral source is already captured at client intake (`referral` field, built into the new-client onboarding flow) — this workflow closes the loop by attributing a *new* client's first booking back to whoever referred them, which is the actual data an owner needs to know if referral incentives are working.

---

## Part 3 — Differentiators: underserved problems, and the $10M ARR bet

### The market math, roughly

A genuinely good all-in-one tool is worth what a shop currently pays across a fragmented stack (booking + POS + payroll add-on + a separate compliance/accounting habit) — realistically **$150–300/month** for an independent shop, more for multi-location. At $200/month average:

- **~4,200 paying locations** → **$10M ARR**.

The US alone has well over 1 million hair/barber/nail/spa establishments; even a narrow wedge into walk-in-heavy barbershops and independent salons (where Shortcuts and Vagaro are weakest, see below) makes 4,200 a realistic multi-year target, not a moonshot. The point of the differentiators below is to identify wedges where the incumbents are genuinely bad, not just "also offer everything they offer."

### Where the incumbents are actually weak

| Competitor | Real weakness |
|---|---|
| **Shortcuts Software** | Veteran in walk-in/barbershop queue management (why it's the reference point for this whole project) — but dated UX, weak financial/BI depth, no compliance tooling |
| **Vagaro** | Broad, but appointment-first; walk-in/queue handling is an afterthought; reporting is generic across all business types it serves, not salon-specific |
| **GlossGenius** | Excellent UX for solo/small stylists; weak on team complexity, multi-location, and commission/classification nuance |
| **Booksy** | Primarily a client-acquisition marketplace with software bolted on; owner-side tooling is comparatively thin |
| **Mindbody** | Powerful, but heavy and expensive — built for large studios/chains, not a 4-chair barbershop |
| **Boulevard** | Modern and well-designed, targets high-end spas/salons; pricing and complexity work against smaller walk-in shops; no visible compliance/classification tooling |

**Nobody in this list treats worker classification, booth-renter independence, or wait-time accuracy as a first-class product surface.** That's the gap.

### Five bets

**A. Accurate real-time wait-time & queue management** *(the wedge — already the foundation of everything built so far)*
Every competitor is appointment-first. Walk-in-heavy barbershops are structurally underserved by tools designed around scheduled bookings. This is the reason a shop switches — everything else keeps them.

**B. Worker classification risk toolkit**
No competitor markets around this, despite it being the single highest-liability item for the industry (already the top-flagged risk in the platform PRD's Legal & Risk module). A concrete feature: at the moment an owner sets a staff member's classification, the platform surfaces the actual DOL/IRS criteria, prompts for the supporting evidence (schedule control, tool ownership, exclusivity), and keeps that documentation attached to the staff record — turning a vague liability into a defensible, exportable audit trail. This is genuinely hard for a generalist competitor to bolt on later; it requires real domain investment, which is exactly what makes it defensible.

**C. Booth renter as a first-class citizen, not a shaped-down employee**
Booth rental is the dominant model in a large share of this industry, and every competitor's data model quietly assumes "staff = employee." A real "independent mode" — the renter's own scheduling surface with zero shop-imposed defaults, their own reporting/P&L, portable client data per whatever agreement they've signed, arguably even their own lighter-weight subscription — unlocks a segment that's currently forced into employee-shaped tools that undermine their own legal status.

**D. Privacy-safe client identity, marketed as trust**
The two-tier identity model already designed (local vs. verified cross-org account, phone-recycling protection) isn't just a technical safeguard — it's a genuine trust differentiator that can be stated plainly to a client: *"we don't hand your visit history to whoever gets your old number."* Competitors that treat phone number as a permanent key have this exact bug; making the fix visible is a real point of differentiation, not just internal hygiene.

**E. Real BI for small operators**
Cohort/retention analysis, forecasting, and anomaly alerts (Module 7) are usually enterprise-tier features gated behind Mindbody-level pricing and complexity. Making genuinely useful BI accessible to a single-location shop — plain-language insights, not a dashboard requiring a data analyst to read — is underserved precisely because it's not profitable for an enterprise-first competitor to build well for a small customer.

### What this suggests about pricing/packaging

Bet A is the acquisition wedge (it's the reason to switch). Bets B and C are retention and expansion — they're stickier and harder to replicate, so they're reasonable candidates for a higher tier rather than being given away, especially B, which has real ongoing content/compliance maintenance cost to sustain. Bet D is a trust/marketing asset more than a revenue line on its own. Bet E is the natural upsell once a shop has enough transaction history for BI to be worth showing.
