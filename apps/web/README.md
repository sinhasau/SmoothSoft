# apps/web

Not yet scaffolded. When you initialize this (`npx create-next-app@latest .` with
the App Router and TypeScript):

- SSR/ISR for the public booking pages, CSR for the authenticated staff app —
  see SYSTEM-ARCHITECTURE-platform.md §1.
- TanStack Query for server state with optimistic updates — the live queue needs
  to feel instant, not just eventually-consistent.
- The interactive prototype built during design (Live Queue / Clients / Reports /
  Settings tabs) is a UX reference for behavior, not code to port — it was
  vanilla HTML/JS built for rapid iteration, not a real component architecture.
  Rebuild the interactions properly against real API endpoints, don't copy the
  markup.
