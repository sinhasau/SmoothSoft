alter table clients add column if not exists email text;
alter table clients add column if not exists marketing_opt_in boolean not null default false;

alter table appointments add column if not exists confirmation_code text unique;
alter table appointments add column if not exists cancelled_at timestamptz;

create table if not exists public_booking_settings (
  location_id uuid primary key references locations(id),
  enabled boolean not null default true,
  minimum_lead_hours int not null default 2 check (minimum_lead_hours >= 0),
  booking_horizon_days int not null default 60 check (booking_horizon_days between 1 and 365),
  slot_interval_minutes int not null default 30 check (slot_interval_minutes in (15, 20, 30, 60)),
  updated_at timestamptz not null default now()
);

create table if not exists communication_messages (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  client_id uuid references clients(id),
  appointment_id uuid references appointments(id),
  channel text not null check (channel in ('sms', 'email')),
  message_type text not null check (message_type in ('booking_confirmation','appointment_reminder','you_are_next','barber_ready','review_request','schedule_publication')),
  destination text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_ref text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_communications_delivery on communication_messages(status, scheduled_for);
create index if not exists idx_communications_location on communication_messages(location_id, created_at desc);

alter table public_booking_settings enable row level security;
drop policy if exists location_isolation on public_booking_settings;
create policy location_isolation on public_booking_settings using (location_id = current_setting('app.current_location_id')::uuid);

alter table communication_messages enable row level security;
drop policy if exists location_isolation on communication_messages;
create policy location_isolation on communication_messages using (location_id = current_setting('app.current_location_id')::uuid);

-- Narrow SECURITY DEFINER lookup used only to establish the RLS scope for a
-- public booking URL. It reveals no business data beyond the owning org id.
create or replace function public_booking_scope(target_location uuid)
returns table (organization_id uuid, location_id uuid)
language sql
security definer
set search_path = public
as $$
  select l.organization_id, l.id
  from locations l
  left join public_booking_settings pbs on pbs.location_id = l.id
  where l.id = target_location and coalesce(pbs.enabled, true) = true
$$;

revoke all on function public_booking_scope(uuid) from public;
grant execute on function public_booking_scope(uuid) to salon_app;
