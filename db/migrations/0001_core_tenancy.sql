-- 0001_core_tenancy.sql
-- Organizations and locations: the root of the multi-tenant hierarchy.
-- Every downstream table carries location_id (or organization_id for the
-- few org-wide entities) — this is the column every RLS policy in
-- 0008_row_level_security.sql filters on.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy client name search, used in 0007

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_structure text,                          -- 'sole_prop' | 'llc' | 's_corp' | ...
  allow_staff_multi_location boolean not null default false,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  timezone text not null default 'America/Detroit',
  created_at timestamptz not null default now()
);

-- Baseline FK index: every child-of-organization list ("all this org's
-- locations") is a hot query for the Owner cross-location dashboard.
create index idx_locations_organization_id on locations (organization_id);
