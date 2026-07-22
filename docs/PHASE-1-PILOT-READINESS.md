# Phase 1 pilot readiness

Phase 1 is the staff-operated visit lifecycle: recognize a client, check in,
manage an explainable queue, provide a service, take and reconcile payment,
rebook, publish the team schedule, and measure whether wait promises were met.

## Implemented

- Durable estimate, service-start, and service-completion timestamps for queue accuracy.
- Thirty-day wait-accuracy KPI on the location overview.
- Stable checkout idempotency records and human-readable receipt numbers.
- Audited cash/external refunds with remaining-balance validation.
- Durable weekly schedule publication, warning count, actor, notification scope, and timestamp.
- Client consent history and staff-assisted rebooking with upcoming appointments.
- Manager authorization for financial reports, sales, closing, refunds, schedule decisions, and settings mutations.
- Desktop sidebar and compact mobile navigation centered on Today, Schedule, and Clients.
- CI type-check and production-build verification for API and web workspaces.

## Required before a live pilot

1. Apply migrations through `0019_pilot_operations.sql` in a staging database.
2. Replace the development roster login with real identity verification.
3. Configure one supported payment processor and its webhook endpoint.
4. Implement processor-confirmed card refunds; the API currently blocks them deliberately.
5. Connect schedule publication to an SMS/email provider. Publication is recorded, but delivery is not sent yet.
6. Confirm the consent language and version with the business/legal owner.
7. Add database-backed integration and browser E2E tests once a reproducible test Postgres service is available.
8. Run a tablet pilot using deliberately interrupted Wi-Fi; offline mutation replay remains follow-up work.

## Pilot acceptance metrics

- No duplicate charge for repeated submission of the same checkout key.
- 100% of completed sales have a receipt number and queue entry.
- Cash drawer closes with a recorded variance and actor.
- Median absolute wait-estimate error is visible after completed visits.
- Every published week has a publication actor and timestamp.
- Rebooked visits are visible on the client profile.
- Staff cannot call manager-only mutation endpoints.

