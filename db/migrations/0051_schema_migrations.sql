-- 0051_schema_migrations.sql
-- Records which migrations a database has already had.
--
-- WHY: `npm run db:migrate` used to replay every file on every run. That only
-- worked against an empty database — against an already-migrated one it died
-- on the first bare `create table` and never reached the newest migration, so
-- shipping a schema change meant applying the new file by hand and hoping
-- nobody forgot. Nothing recorded what had been applied, so "which ones does
-- this database need?" was unanswerable except by inspecting the schema.
--
-- scripts/migrate.mjs now consults this table and applies only what is
-- missing, each file in its own transaction so a failure leaves no partial
-- record. Migration safety is enforced separately by
-- apps/api/src/db/migration-safety.test.ts, which fails CI on any new file
-- that would not survive a second run.

create table if not exists schema_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now(),
  -- Set when a row was recorded by `db:migrate:baseline` on a database that
  -- predates this table, rather than by actually executing the file.
  baselined   boolean not null default false
);

comment on table schema_migrations is
  'One row per applied migration file. Managed by scripts/migrate.mjs — do not edit by hand.';
