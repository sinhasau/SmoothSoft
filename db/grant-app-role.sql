-- db/grant-app-role.sql
-- Run once against DATABASE_MIGRATE_URL (the table-owning role) after
-- migrations, and again after any migration that adds new tables.
--
-- WHY THIS FILE EXISTS: Postgres Row-Level Security policies are bypassed
-- for a table's owning role (and for superusers), regardless of any USING
-- clause on the policy. Verified locally while standing this up: querying
-- as the owner role returned rows across two simulated tenants even with
-- RLS enabled on the table; querying as salon_app (this role) correctly
-- returned only the scoped tenant's rows. The application must NEVER
-- connect as the migration-owning role — see .env.example.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'salon_app') THEN
    CREATE ROLE salon_app LOGIN PASSWORD 'salon_app_dev_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO salon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO salon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO salon_app;

-- Covers tables created by future migrations without needing to re-run this
-- grant list manually every time.
--
-- `FOR ROLE` is deliberately omitted, which makes these apply to whoever is
-- running this file. Naming a role here instead hardcodes the local dev owner
-- (`salon`) and fails outright on a managed database, where the owner is
-- something else — Neon calls it `neondb_owner`. That failure aborted a
-- production reset partway through, after the schema was rebuilt but before
-- any data was seeded.
--
-- Omitting it is also the correct behaviour, not merely the portable one:
-- default privileges attach to the role that CREATES the object, and the role
-- running this file is the same one that runs the migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO salon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO salon_app;
