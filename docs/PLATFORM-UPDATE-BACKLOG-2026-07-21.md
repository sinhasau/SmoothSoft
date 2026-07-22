# SmoothSoft platform status and update backlog

Date: July 21, 2026

## Executive view

SmoothSoft has a credible end-to-end pilot foundation. Booking, walk-in intake, the live queue, service delivery, checkout, staff attribution, scheduling, client history, and payroll review now form one connected operating loop. That is the product’s strongest advantage.

It is not ready for an unattended public launch. The highest-value next step is a focused launch-hardening phase, not another broad feature phase. Payments, communications, identity, monitoring, backups, and automated browser coverage must become dependable before the platform handles live money and sensitive employee data without supervision.

## What works today

### Daily operations

- Walk-in and appointment intake with multiple services.
- Clocked-in staff eligibility and organized professional selection.
- Live queue, wait estimates, stale-wait protection, reordering, arrival, service start, reassignment, correction, completion, and activity history.
- Sanitation reminders with completion and ten-minute snooze behavior.
- Opening and closing checklists with cash-drawer counts and variance.

### Scheduling

- Weekly schedule, date navigation, date-range selection, issue filtering, and fixed chair capacity.
- Shift create, edit, remove, duplicate, and recurring weekly changes with confirmation.
- Overtime, minimum coverage, chair-capacity, and estimated-labor warnings.
- Schedule publishing records and keyboard undo support.
- Employee profile links, active/inactive/resigned organization, and recurring availability.

### Checkout and sales

- Itemized services and products, service corrections, tip entry, tax, discounts, stock validation, and stock decrement.
- Requested-professional premiums apply only when the requested professional performs the service.
- Owner-configurable request-premium attribution to the professional or shop.
- Manual payment recordkeeping and Stripe/Square server adapter foundations.
- Receipt view/print, sales history, and cash/manual refund records.

### Team and payroll preparation

- Employee onboarding, status, role, recurring hours, goals, pay model, and custom roles/pay models.
- Securely stored and masked SSNs.
- License/document records with issue and expiration dates, file upload, view, and download.
- Per-service completion-time learning for wait estimates.
- Configurable pay schedules, current pay-period calculation, staff revenue/pay estimates, saved pay-period reviews, and PDF/Excel exports.

### Clients, booking, and communications

- Client search, profiles, notes, history, consent, upcoming visits, rebooking, and phone formatting.
- Public service/professional/date/time booking with schedule and overlap checks.
- Durable confirmation/reminder outbox and manager-visible delivery status.

### Reporting and controls

- Revenue, payments, discounts, staff pay, utilization, no-show/cancel/abandon, clients, services, products, compliance, tax-readiness, and wait-accuracy reporting.
- Feature controls for products, discounts, professional-request pricing, messaging, and sanitation.
- Location hours, special dates, chair capacity, labor assumptions, sales tax, payroll schedule, and payment-mode settings.
- Tenant-scoped request transactions and PostgreSQL row-level security foundation.

## P0 — required before a live public launch

### Identity, authorization, and sensitive data

1. Replace development sign-in with production identity: verified email/password or managed identity, secure sessions, logout, password reset, and account recovery.
2. Add MFA for owners and managers, session revocation, login throttling, and security-event logging.
3. Complete an endpoint-by-endpoint authorization matrix and automated negative tests for owner, manager, front desk, staff, and customer access.
4. Separate employee tax-data permissions from general manager access; add explicit access logs for SSN and tax-document operations.
5. Define retention, deletion, export, and breach-response policies for customer and employee data.
6. Move secrets to a managed secret store, rotate local credentials, and verify that no secrets or uploaded private files can enter source control.

### Payments and financial correctness

7. Choose one processor for launch. Finish its client-side tokenization/terminal flow, onboarding, credential storage, and connection-health UI before supporting a second provider.
8. Add verified, idempotent payment webhooks and reconciliation for succeeded, failed, disputed, canceled, and delayed payments.
9. Implement processor-confirmed full and partial card refunds. Keep local sale state unchanged until the processor confirms success.
10. Add voids, manager approval thresholds, refund permissions, reason codes, and an exception/reconciliation queue.
11. Finish customer receipt delivery and reliable print formatting; include refund/void history and merchant details.
12. Add split tender, cash change due, drawer ownership/shift boundaries, and daily processor-versus-platform reconciliation.
13. Perform a PCI scope review and document that raw card data never reaches SmoothSoft servers.

### Messaging and public booking

14. Connect one SMS/email provider and build an outbox worker with retry policy, idempotency, failure reasons, and dead-letter handling.
15. Add opt-in/opt-out, quiet hours, consent evidence, message templates, test-send, sender identity, and delivery-cost visibility.
16. Add public booking rate limits, bot protection, abuse monitoring, and generic responses that do not expose whether a customer exists.
17. Add customer cancellation/rescheduling with policy enforcement, confirmation, and staff notification.
18. Validate availability and reminders across location time zones, daylight-saving transitions, closures, and special hours.

### Reliability and release engineering

19. Create isolated staging and production environments with an explicit configuration matrix.
20. Add structured logs, error tracking, request correlation, payment/outbox metrics, uptime checks, and alerts with named owners.
21. Automate database backups and complete a restore drill; document recovery-time and recovery-point targets.
22. Add migration preflight, backup, rollback/forward-fix, and production deployment runbooks.
23. Build seeded browser E2E tests for booking, walk-in, service start/change/reassign, checkout with products, refunds, scheduling, documents, payroll logging, and exports.
24. Make type checks, unit tests, builds, migration tests, dependency scanning, accessibility checks, and browser E2E required CI gates.
25. Resolve known dependency vulnerabilities and establish a recurring upgrade cadence.
26. Stabilize the current large local change set into reviewable commits/PRs before further broad feature work.

## P1 — required for a dependable single-location pilot

### Product-wide experience and warmth

27. Extend the new employee-profile visual direction across owner pages: warm neutral surfaces, restrained sage/amber accents, human identity, softer depth, and clearer section hierarchy.
28. Create shared design tokens and components for page headers, section headers, summary cards, form groups, empty states, alerts, drawers, and destructive actions.
29. Standardize page width, spacing rhythm, label placement, input height, corner radius, shadows, and primary/secondary action order.
30. Replace remaining native-looking checkboxes and inconsistent accordions with accessible shared controls where the custom treatment materially improves clarity.
31. Add calm skeleton loading, success toasts, inline save state, retry actions, and unsaved-change protection.
32. Add meaningful empty states with one next action, not only “No data” messages.
33. Complete responsive QA at phone, tablet, laptop, and wide-desktop sizes; include touch targets and landscape shop tablets.
34. Complete keyboard and screen-reader QA, visible focus states, contrast checks, form error association, reduced motion, and automated accessibility scans.
35. Add an optional compact density for high-volume queue and schedule users while keeping the warmer default.

### Queue and front desk

36. Show a concise explanation for each wait estimate and when it was last recalculated.
37. Add connection/offline state, safe retry, reconnect reconciliation, and protection against duplicate operator actions.
38. Add configurable late-arrival, no-show, cancellation, and walk-out policies with clear audit history.
39. Send “you’re next,” “professional is ready,” delay, and appointment-risk messages from queue events.
40. Add customer-facing queue status with privacy-safe names/codes and owner-configurable display behavior.
41. Add role-aware shortcuts and a command palette for the most common nine-hour-a-day actions.

### Scheduling and time

42. Add employee availability, time-off requests, approval, blackout dates, PTO balances, and conflicts against recurring schedules.
43. Add reusable shift templates, copy week, repeating patterns, bulk edit, and publish-change summaries.
44. Separate planned schedule hours from verified time worked; add time punches, corrections, approvals, breaks, and overtime calculations.
45. Improve staffing guidance using appointments, historical walk-ins, service mix, and chair constraints instead of a single minimum-coverage number.
46. Add published-schedule delivery through the messaging worker and record who received each version.
47. Test keyboard undo, drag/drop, and shift editing with concurrent managers and conflict recovery.

### Team, payroll, and compliance

48. Turn onboarding into a checklist: identity, role, employment classification, pay, tax forms, emergency contact, credentials, policies, and first schedule.
49. Add compensation effective dates chosen by the owner, approval/history views, and safeguards against overlapping pay rules.
50. Connect actual time worked to hourly/overtime pay and clearly separate payroll estimates from approved payroll inputs.
51. Add pay-period approval status, adjustments, comments, sign-off, locked/reopened states, and a full audit trail.
52. Integrate a payroll provider rather than implementing withholding, deposits, W-2/W-3, or 1099 filing internally.
53. Add credential renewal reminders, required-document templates by role, document version history, and missing-document rules.
54. Add emergency contacts, address, start/end dates, manager, notes, performance reviews, disciplinary records, and offboarding checklist with strict permissions.
55. Add time-based performance trends and explain how service-duration history affects current wait estimates.

### Clients and customer experience

56. Add complete profile editing, duplicate detection/merge, communication preferences, preferred professional, and household/dependent relationships.
57. Add self-service appointment history, cancellation/rescheduling, receipts, consent, and data-request controls.
58. Add deposits/no-show policies only after payment-method tokenization and consent are production-ready.
59. Add consultation/intake forms, allergies, service notes, attachments, and versioned waivers appropriate to configured services.
60. Define customer-data ownership when a professional leaves or operates as a booth renter.

### Reports, settings, and owner control

61. Add report drill-down from totals to source sales/appointments and consistent CSV export.
62. Add actual-versus-estimated payroll reconciliation and surface every adjustment in saved pay-period files.
63. Complete employer tax profile and payroll-provider connection flows; keep tax center wording explicit about what SmoothSoft does not file.
64. Add owner dashboard exceptions: checkout failures, unreconciled payments, missing punches, expiring documents, message failures, inventory variance, and schedule risk.
65. Add Settings search, setup checklist, validation summaries, save confirmation, and clear organization-versus-location scope.
66. Add configuration change history with actor, old value, new value, and rollback for safe settings.

## P2 — growth after pilot evidence

67. Inventory purchasing: vendors, cost basis, purchase orders, receiving, adjustments, low-stock alerts, reorder suggestions, and shrinkage reporting.
68. Loyalty, points, memberships, prepaid packages, subscriptions, and gift cards with deferred-revenue accounting.
69. Marketing segments, campaigns, review requests, attribution, suppression lists, and ROI reporting.
70. Business intelligence: retention/cohorts, lifetime value, churn risk, service/staff trends, anomaly detection, and demand/revenue forecasting.
71. Accounting exports/integration for QuickBooks or Xero; avoid building a general ledger inside SmoothSoft.
72. Multi-location organization controls, cross-location staff, consolidated reporting, location-level permissions, and regional configuration.
73. Public shop presence, maps/business-profile integrations, review aggregation, branded domains, and search/analytics instrumentation.
74. Recruiting, applicant tracking, continuing education, benefits/PTO administration, and richer HR workflows if pilot customers demand them.

## Product decisions still required

1. W-2 employees, 1099 contractors, booth renters, or a supported mixture—and who is legally allowed to receive which pay calculations.
2. The first payment processor and whether launch checkout is terminal-led, web-tokenized, or manual only.
3. The first messaging provider, supported channels, who pays per message, and default communication policy.
4. Deposit, cancellation, late-arrival, no-show, refund, and manager-approval policies.
5. Customer-data ownership and export rules when a professional leaves.
6. Pilot hardware, receipt-printing expectations, cash-drawer process, and network reliability.
7. Whether the first pilot includes public booking or begins with staff-operated intake only.

## Recommended delivery sequence

1. **Stabilize (1 week):** organize and review the current change set, update migrations, remove dependency vulnerabilities, and establish staging.
2. **Launch rails (2–4 weeks):** production identity, one payment rail, one messaging rail, observability, backups, and required CI E2E journeys.
3. **Supervised pilot (2 weeks):** one location, two or three staff, manual fallback available, daily money/inventory/payroll reconciliation.
4. **Pilot corrections (1–2 weeks):** address only measured failure points and high-frequency staff friction.
5. **Controlled production:** expand staff and transaction volume before adding another provider, location, or major module.

## Pilot scorecard

- Booking completion rate and booking failures.
- Median and 90th-percentile wait-estimate error.
- Checkout success, duplicate-prevention, and refund success rates.
- Cash and processor reconciliation variance.
- Inventory variance for products sold.
- Message delivery and opt-out rates.
- Schedule edits after publication and overtime/coverage exceptions.
- Payroll adjustments required after export.
- Time to complete top operator tasks and support incidents per day.
- Staff satisfaction after a full shift, not only a demo.

