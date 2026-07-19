-- 0003_clients_identity.sql
-- Local (org-scoped) client profiles + the phone-binding safeguard against
-- carrier number reassignment + the optional, verification-gated global
-- cross-org identity. See ARCHITECTURE-data-and-perspectives.md Part 3 for
-- the full reasoning.

create table clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  -- NORMALIZATION: store BOTH a display phone and a normalized (digits-only)
  -- phone. The prototype computed the normalized form at query time
  -- (`.replace(/\D/g,'')`) on every lookup — fine at prototype scale, a
  -- real cost once client search runs thousands of times a day across
  -- 10,000 tenants. Normalizing on write means the match column is a plain
  -- indexed value, not a function result.
  phone_normalized text,
  phone_display text,
  referral_source text,
  notes text,
  allergy_flag boolean not null default false,
  last_confirmed_at timestamptz,        -- staleness check for the phone-reassignment guard
  created_at timestamptz not null default now()
);

create table phone_bindings (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text not null,
  client_id uuid not null references clients(id),
  bound_at timestamptz not null default now(),
  superseded_at timestamptz             -- null = currently active binding
);

create table global_client_accounts (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text,
  email text,
  verified_at timestamptz not null,     -- always set via OTP confirmation, never inferred
  created_at timestamptz not null default now()
);

create table client_identity_links (
  local_client_id uuid not null references clients(id),
  global_account_id uuid not null references global_client_accounts(id),
  linked_at timestamptz not null default now(),
  verification_method text not null,    -- 'sms_otp' | 'email_otp'
  primary key (local_client_id, global_account_id)
);

-- Baseline FK indexes
create index idx_clients_organization_id on clients (organization_id);
create index idx_phone_bindings_client_id on phone_bindings (client_id);
