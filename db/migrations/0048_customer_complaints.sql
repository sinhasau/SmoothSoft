-- 0048_customer_complaints.sql
-- Customer complaints ("customer flow" feedback): a standalone public form lets a
-- customer report a problem, and front-desk/managers see them live under Manage.
-- Same location-scoped RLS model as the rest of the operational tables — the public
-- submit path is scoped by public_booking_scope() (see rls-transaction.middleware.ts),
-- which sets app.current_location_id just like an authenticated session does.

create table customer_complaints (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  client_id uuid references clients(id),          -- linked when a known customer submits; null for an anonymous walk-up
  customer_name text not null,
  customer_phone text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'resolved')),
  handled_by_user_id uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Feed query is "this location's complaints, newest first"; the partial-friendly
-- composite index covers both the default list and status filtering.
create index idx_customer_complaints_location on customer_complaints (location_id, created_at desc);

alter table customer_complaints enable row level security;
-- FOR ALL with only USING also applies as the INSERT WITH CHECK in this Postgres,
-- so the public submit (scoped location) can insert and staff reads stay location-bound.
create policy location_isolation on customer_complaints
  using (location_id = current_setting('app.current_location_id')::uuid);

grant select, insert, update, delete on customer_complaints to salon_app;
