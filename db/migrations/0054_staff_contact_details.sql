-- Home address and contact details for staff.
--
-- `users` already had `phone` and `email` but no address anywhere in the
-- schema — not on users, not on location_staff, not on employee_tax_identities.
-- That left the platform holding the sensitive half of payroll identity (an
-- encrypted SSN, migration 0039) while unable to produce a filing: a W-2 or
-- 1099-NEC needs the recipient's mailing address next to that SSN. Payroll
-- preparation and export is a headline deliverable in the platform PRD, so an
-- export without addresses is not usable by a payroll provider.
--
-- On `users`, not `location_staff`, deliberately. A person has one home
-- address regardless of how many shops they work at; per-assignment columns
-- would allow two different addresses for one human with no rule for which is
-- real. Same reasoning `users` already holds phone and full_name.
--
-- Every column is nullable. Existing rows stay valid, nothing requires a
-- backfill, and the migration is safe to apply before the API build that reads
-- them — which is the ordering CLAUDE.md requires.
alter table users add column if not exists address_line1 text;
alter table users add column if not exists address_line2 text;
alter table users add column if not exists city text;
-- "region" rather than "state": state is a reserved-ish word in enough tools to
-- be annoying, and this has to hold provinces too if the platform ever crosses
-- a border.
alter table users add column if not exists region text;
alter table users add column if not exists postal_code text;
-- ISO 3166-1 alpha-2. Defaulted for existing rows because every current
-- location is in Michigan; still nullable-friendly for anything later.
alter table users add column if not exists country char(2) default 'US';

-- Emergency contact. Asked for in the same breath as an address by every shop
-- that has ever had someone collapse mid-shift, and it belongs to the person
-- rather than to one assignment.
alter table users add column if not exists emergency_contact_name text;
alter table users add column if not exists emergency_contact_phone text;

comment on column users.address_line1 is
  'Home address. RESTRICTED: owner (own org) and managers (own location) only — see staff-contact-visibility.ts. Never include in the pre-auth login roster.';
comment on column users.emergency_contact_phone is
  'RESTRICTED, same rule as address. Not a client-facing field.';

-- `users` is deliberately NOT row-level-security scoped (it is the global login
-- identity — one user can staff locations across organizations, so isolation
-- comes from the location_staff join, and rls-isolation.test.ts documents this
-- in NOT_TENANT_SCOPED). That means the database will NOT stop one tenant
-- reading another's staff contact details: the guard is the application's
-- visibility rule plus the fact that every staff query reaches users through
-- an RLS-protected location_staff join.
--
-- Recorded here because it is the one place this schema relies on application
-- code rather than a policy, and anyone adding a new staff query needs to know
-- to go through the join rather than selecting from users directly.
