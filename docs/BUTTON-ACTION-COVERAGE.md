# Button and action coverage

Updated July 21, 2026.

The platform treats a “button” as a user action, not merely a DOM element. Repeated controls rendered from the same component or row template share one behavior contract. Coverage is layered so business rules are tested below the UI and representative controls are exercised through the real localhost application.

| Surface | Actions covered | Automated coverage | Local E2E evidence |
|---|---|---|---|
| Shared controls | Primary/disabled button, row menu open/action/close, status dropdown, clock-in dropdown | `components/ui.test.tsx` | Queue menu and reassignment exercised |
| Queue intake | Appointment, walk-in, requested/next-available staff, arrival, start, service change | Type checks + shared controls; API authorization/validation | Existing seeded and live queue inspected |
| Active service | Reassign, return to waiting, cancel, complete | Premium/assignment rules + shared controls | Reassigned a live service and verified staff state |
| Checkout | Service/product add/remove, tip presets/input, discount disclosure, payment choice, complete | Product count and requested-premium rule tests | Added Beard Oil + $5 tip; completed a $36 manual sale |
| Scheduling | Week navigation, view/role/issues filters, requests, shift editor, publish, print | Shared controls + type checks | Week view and all action semantics inspected |
| Clients/team/settings | Save, rebook, consent, document, catalog, discount, processor configuration | Shared controls + type checks | Pages loaded and actions inventoried |
| Reports | Date ranges, report selection, PDF/XLSX downloads, pay-run log | Export generation/build checks | Live report artifacts generated and inspected |
| Public booking | Service, period, time, professional/date inputs, submit | Booking date/overlap rules | Full real booking completed with confirmation/outbox |
| Appointments | Open booking, check in to Floor, role-aware cancel | Appointment action component tests | Empty and populated operational states inspected |
| Role boundaries | Manager-only edits/refunds, staff self-service, front-desk receipt access | API authorization plus conditional-control tests | Manager, staff, owner and customer browser journeys exercised |

## CI gate

Current result: **43 tests pass** across API and web suites, both type checks pass, and both production builds pass. Repeated row controls share a single component/action contract rather than duplicating an identical test for every rendered record. Production CI must additionally run the localhost browser journeys against an isolated seeded database; unit tests alone cannot verify routing, focus, drag/drop, printing, file downloads, third-party tokenization, or multi-page role journeys.
