-- Operational sanitation checks are timed tasks, not expiring compliance documents.
create table if not exists location_sanitation_settings (
  location_id uuid primary key references locations(id) on delete cascade,
  enabled boolean not null default false,
  interval_hours integer not null default 2 check (interval_hours between 1 and 8),
  next_due_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists sanitation_reminder_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  action text not null check (action in ('completed', 'snoozed')),
  scheduled_for timestamptz,
  next_due_at timestamptz not null,
  actor_user_id uuid references users(id),
  acted_at timestamptz not null default now()
);

create index if not exists idx_sanitation_events_location_time
  on sanitation_reminder_events(location_id, acted_at desc);

alter table location_sanitation_settings enable row level security;
drop policy if exists location_isolation on location_sanitation_settings;
create policy location_isolation on location_sanitation_settings
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);

alter table sanitation_reminder_events enable row level security;
drop policy if exists location_isolation on sanitation_reminder_events;
create policy location_isolation on sanitation_reminder_events
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);

-- Remove the old fake overdue record. Real checks are retained in the event table above.
delete from compliance_documents
where doc_type = 'sanitation_log'
  and description = 'Sanitation log not updated in 40 days.';
