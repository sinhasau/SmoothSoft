#!/usr/bin/env node
/**
 * Applies only the migrations a database has not had yet.
 *
 * Replaces the previous shell loop, which replayed all 50 files on every run
 * and therefore only ever worked against an empty database — against a live
 * one it failed on the first bare `create table` and never reached the newest
 * migration.
 *
 * Usage:
 *   node scripts/migrate.mjs              apply everything outstanding
 *   node scripts/migrate.mjs --dry-run    list what would run, change nothing
 *   node scripts/migrate.mjs --baseline   record every file as applied WITHOUT
 *                                         running it — one-time adoption for a
 *                                         database that was migrated by hand
 *                                         before tracking existed
 *
 * Reads DATABASE_MIGRATE_URL (the table-owning role — NOT the app role; see
 * .env.example for why those are separate).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const TRACKING_TABLE_MIGRATION = '0051_schema_migrations.sql';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const baseline = args.has('--baseline');

const connectionString = process.env.DATABASE_MIGRATE_URL;
if (!connectionString) {
  console.error('DATABASE_MIGRATE_URL is not set. It must point at the table-owning role, not the app role.');
  process.exit(1);
}

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  // The tracking table has to exist before it can be consulted, and it is
  // itself a migration — so apply that one file directly first. It is
  // `create table if not exists`, so this is safe on every run.
  await client.query(readFileSync(join(MIGRATIONS_DIR, TRACKING_TABLE_MIGRATION), 'utf8'));

  const { rows } = await client.query('select filename from schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const outstanding = files.filter((f) => !applied.has(f));

  if (baseline) {
    if (applied.size > 0) {
      console.error(`Refusing to baseline: schema_migrations already has ${applied.size} row(s).`);
      console.error('Baseline is a one-time adoption step for a database that predates migration tracking.');
      process.exit(1);
    }
    if (dryRun) {
      console.log(`Would baseline ${files.length} migration(s) as already applied, without running them.`);
    } else {
      for (const filename of files) {
        await client.query('insert into schema_migrations (filename, baselined) values ($1, true)', [filename]);
      }
      console.log(`Baselined ${files.length} migration(s) as already applied. None were executed.`);
      console.log('Future runs of `npm run db:migrate` will apply only genuinely new files.');
    }
    process.exit(0);
  }

  if (!outstanding.length) {
    console.log(`Up to date — all ${files.length} migration(s) already applied.`);
    process.exit(0);
  }

  if (dryRun) {
    console.log(`${outstanding.length} migration(s) would be applied:`);
    for (const f of outstanding) console.log(`  ${f}`);
    process.exit(0);
  }

  for (const filename of outstanding) {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    // One transaction per file: a failure rolls back that file's changes AND
    // its tracking row together, so the recorded state never claims a
    // half-applied migration succeeded.
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1) on conflict (filename) do nothing', [filename]);
      await client.query('commit');
      console.log(`applied  ${filename}`);
    } catch (error) {
      await client.query('rollback');
      console.error(`FAILED   ${filename}`);
      console.error(`  ${error.message}`);
      console.error('\nNothing from this file was applied. Fix it and re-run — already-applied migrations are skipped.');
      process.exit(1);
    }
  }

  console.log(`\nDone. Applied ${outstanding.length} migration(s).`);
} finally {
  await client.end();
}
