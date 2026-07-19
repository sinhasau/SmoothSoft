# apps/mobile

Not yet scaffolded. React Native — see SYSTEM-ARCHITECTURE-platform.md §1.

**Two separate apps, not one with a mode switch:**
- Staff app — queue, check-in, checkout. Offline-first (local SQLite/WatermelonDB
  cache with event-queue replay) — a shop floor tablet cannot lose the queue over
  a dropped wifi connection.
- Client app — booking, live wait status, loyalty, payment methods.

Build the web app first. Mobile is not the place to work out interaction design
from scratch — port validated patterns from apps/web once they're proven.
