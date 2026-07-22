# SmoothSoft system assessment

Date: July 21, 2026

For the complete prioritized implementation inventory, see [PLATFORM-UPDATE-BACKLOG-2026-07-21.md](./PLATFORM-UPDATE-BACKLOG-2026-07-21.md).

## Executive conclusion

SmoothSoft is now a credible **supervised-pilot product**, not yet a production-ready system of record. Its strongest differentiator is the connected operating loop: multi-service booking → appointment/check-in → queue → service → checkout/refund → staff settlement/reporting. The next move should be a launch-hardening sprint, not another broad feature phase, followed by a tightly controlled single-location pilot.

## What is working well

- The queue is operationally focused and considerably less cluttered: active wait is readable, stale records are separated from the useful longest-wait metric, secondary actions are in row menus, and only clocked-in professionals are eligible for walk-ins.
- Active services can be reassigned without leaving staff states inconsistent. The service start timestamp now remains authoritative through reassignment, protecting duration and prediction data.
- Checkout supports corrected/additional services, canonical retail products, stock locking/decrement, clear tip entry, optional discounts, tax, and manual or linked-card configuration.
- Requested-professional premiums are calculated on the server and only earned when the originally requested professional performed the service.
- Revenue by Staff is usable as a payroll review: service/retail/refund/tip/commission/booth-rent inputs, warnings, immutable review snapshots, and PDF/XLSX exports.
- Public booking reads real services, staff and schedules, rejects overlaps, serializes same-professional/day booking attempts, creates/updates clients, and queues confirmation/reminder messages.
- PostgreSQL row-level security and request transactions provide a meaningful multi-tenant foundation.
- Role journeys are materially separated: owner/manager, front desk, professional and customer now receive different navigation, data and controls.
- Appointments no longer stop at booking: staff can review upcoming bookings and move an arrived client onto Floor without re-entering the visit.
- Location-local dates now drive daily reporting, receipt identifiers and opening/closing records.

## Risk assessment

| Area | Rating | Assessment |
|---|---|---|
| Product usability | Good for pilot | Core operator and customer paths are coherent; schedule remains information-dense by nature and should be validated on the shop’s actual tablet. |
| Data correctness | Good with targeted follow-up | Transactional checkout, inventory locks, immutable payment/pay-run records and booking recheck are strong. Timezone/DST behavior needs broader multi-location tests. |
| Security | Not launch-ready | `npm audit` reports 17 known issues (5 high, 12 moderate), including framework/database-library upgrade paths. Public booking also needs rate limiting, bot controls and abuse monitoring. |
| Payments | Pilot only in manual mode | Manual recordkeeping works. Linked processors need production credentials, webhook verification, idempotency/reconciliation tests, receipt flow and an operator recovery runbook. |
| Communications | Infrastructure slice | Messages are durably queued and visible; no provider worker currently sends, retries or dead-letters them. |
| Payroll/tax | Decision support, not filing | The report is suitable for owner review and export, but it is not a payroll processor, legal classification engine or tax filing system. |
| Reliability/operations | Needs hardening | Add structured telemetry, error tracking, queue/outbox monitoring, automated backups, restore drills, environment separation and migration rollback/runbooks. |
| Automated quality | Foundation established | 43 unit/component tests cover shared controls and high-risk rules; type checks and both production builds pass. CI browser coverage with an isolated database remains a launch gate. |

## E2E findings and disposition

- Fixed: product checkout now uses product identity, authoritative catalog price/name, stock validation/locking and atomic decrement.
- Fixed: active-service reassignment updates both old/new professional status.
- Fixed: reassignment no longer resets the service clock shown in operations or used by duration analytics.
- Fixed: implausible multi-day waits no longer dominate “Longest active wait”; stale entries are clearly labeled for review.
- Fixed: checkout hierarchy, tip discoverability, discount disclosure and payment summary were simplified.
- Fixed: checkout product/service remove controls and add selectors now have clear accessible names.
- Fixed: malformed schedule week-range label and nonfunctional placeholder menu actions were removed.
- Verified: real public booking returned a confirmation code and produced confirmation/reminder outbox entries.
- Verified: real manual checkout with a retail product and tip completed successfully.
- Fixed: integrated card checkout now uses official browser tokenization and never sends raw card details to SmoothSoft; transactions remember their processor and refunds route back to it.
- Fixed: operational store state no longer offers “Open” and “Close” simultaneously.
- Fixed: negative booth-rent balances are labeled as money due to the shop, separate from staff payables.
- Fixed: front-desk employees are excluded from professional matching and chair capacity while retaining the operational tools they need.
- Fixed: online/client-rebook appointments have a staff list, cancellation action and Floor check-in handoff.
- Fixed: the production web build no longer requires network access for fonts.
- Remaining: outbound provider delivery; payment webhooks/reconciliation; customer self-service rescheduling; production authentication/session hardening; dependency upgrades; complete CI browser matrix.

## Verification completed

- API: 8 test files, 20 tests passing.
- Web: 8 test files, 23 tests passing.
- API and web TypeScript checks passing.
- API and Next.js production builds passing.
- Manual browser journeys exercised for manager, staff, owner and customer surfaces, including privacy-negative checks. Front-desk policy was verified in code and requires a dedicated seeded account in the automated browser matrix.
- Current production dependency audit: 17 advisories (5 high, 12 moderate, 0 critical). This is a launch blocker, not a pilot-demo blocker.

## Recommended sequence

1. **Security and platform upgrade:** upgrade Next.js, NestJS/Kysely and affected transitive packages in a dedicated compatibility branch; add dependency scanning to CI. Do not expose the current build publicly first.
2. **Choose the pilot rails:** use manual payments initially or integrate exactly one processor; choose one SMS/email provider. Avoid multiple providers until the core pilot is stable.
3. **Operational hardening:** implement outbox worker/retries, idempotent webhooks, rate limiting, logs/metrics/alerts, backup/restore, secrets management and a support runbook.
4. **Automated release gate:** seeded isolated database; browser journeys for booking, walk-in, start/change/reassign, product checkout, refund, pay-run log and exports; accessibility scan; migration test.
5. **Single-location pilot:** 2–3 staff, 2 weeks, daily reconciliation. Track booking conversion, wait-estimate error, checkout failure rate, inventory variance, message delivery rate and payroll export adjustments.
6. **Only then expand:** build the two or three improvements most clearly demanded by pilot evidence—likely cancellation/deposits, receipts, and low-stock purchasing—before broader HR/marketing/BI modules.

## Go/no-go

- **Go:** internal demos, staff training, sandbox/manual-payment pilot preparation.
- **Conditional go:** one-location supervised pilot after security upgrades, provider setup and backup/monitoring gates.
- **No-go:** unattended public launch, live automated card processing, payroll/tax filing, or multi-location rollout in the current state.
