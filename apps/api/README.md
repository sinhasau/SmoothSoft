# apps/api

Not yet scaffolded. When you initialize this (`nest new .` or equivalent):

- Structure as a **modular monolith** — one Nest module per PRD product module
  (Queue, Clients, POS, Staff, Reports, Settings, Tax, Compliance), per
  SYSTEM-ARCHITECTURE-platform.md §2. Don't split into microservices yet.
- Wire the RLS session-variable middleware **first**, before any feature module —
  see db/README.md's warning about PgBouncer + `SET LOCAL`.
- The WebSocket gateway (live queue real-time updates) is the other early piece —
  Redis pub/sub fan-out, per §2's event-driven architecture section.
- Start with the Queue module reading/writing against the real `events` and
  `queue_entries` tables from db/migrations/0005 — this is the vertical slice
  referenced in the root README's build order.
