#!/usr/bin/env node
/**
 * Drops every table, re-applies all migrations, and reseeds a complete demo
 * shop in one command.
 *
 * This exists because the alternative — adopting an existing database with
 * `--baseline` — has an unrecoverable failure mode (baseline past where the
 * database really is and those migrations never run). A database built from
 * empty is correct by construction: `db:migrate` applies everything in order,
 * the way CI proves on every push.
 *
 *   node scripts/reset-and-seed.mjs --confirm <database-name>
 *
 * THIS DESTROYS ALL DATA IN THE TARGET DATABASE. The confirm argument must
 * match the database named in DATABASE_MIGRATE_URL — you have to type the name
 * of the thing you are about to destroy, so a stray shell-history re-run
 * cannot wipe the wrong database. `transactions` is the financial system of
 * record (3-7 year retention, see the platform PRD); do not point this at a
 * database holding real sales.
 *
 * Reads DATABASE_MIGRATE_URL (the table-owning role — NOT the app role).
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'apps', 'api');

const argv = process.argv.slice(2);
const confirmIndex = argv.indexOf('--confirm');
const confirmed = confirmIndex === -1 ? null : argv[confirmIndex + 1];

const connectionString = process.env.DATABASE_MIGRATE_URL;
if (!connectionString) {
  console.error('DATABASE_MIGRATE_URL is not set. It must point at the table-owning role, not the app role.');
  process.exit(1);
}

/**
 * The database name is the path segment after the host, before any query
 * string. Parsed by hand rather than with `new URL`, because a Unix-socket
 * connection string (`postgres://salon@/mydb?host=/tmp`) has an empty host and
 * `new URL` rejects it outright — which would make this refuse to run locally.
 */
function databaseNameFrom(url) {
  const match = /^postgres(?:ql)?:\/\/[^/]*\/([^?#]+)/.exec(url);
  if (!match) {
    console.error('Could not read a database name out of DATABASE_MIGRATE_URL.');
    process.exit(1);
  }
  return decodeURIComponent(match[1]);
}

const dbName = databaseNameFrom(connectionString);

if (confirmed !== dbName) {
  console.error('This DESTROYS every row in the target database.\n');
  console.error(`  target database: ${dbName}`);
  console.error(`  you passed:      ${confirmed ?? '(nothing)'}\n`);
  console.error(`Re-run with:  node scripts/reset-and-seed.mjs --confirm ${dbName}`);
  process.exit(1);
}

const run = (label, cmd, args, opts = {}) => {
  process.stdout.write(`\n── ${label}\n`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
};

/**
 * Some seeds are extras that need environment the shop itself does not — the
 * tax-identity seed needs STAFF_PII_ENCRYPTION_KEY, for instance. A reset must
 * not fail outright because an optional garnish is unavailable; it warns and
 * carries on, and says at the end what was skipped.
 */
const skipped = [];
const runOptional = (label, cmd, args, opts = {}) => {
  try {
    run(label, cmd, args, opts);
  } catch {
    console.warn(`   skipped — see the error above. The shop does not need this to run.`);
    skipped.push(label);
  }
};

const client = new pg.Client({ connectionString });
await client.connect();
try {
  // Drop the tables one by one rather than dropping the schema.
  //
  // `drop schema public cascade` needs OWNERSHIP OF THE SCHEMA, which managed
  // Postgres does not hand out: on Neon the public schema belongs to
  // pg_database_owner, so neondb_owner — the role that owns every table in it
  // — still gets "must be owner of schema public". Dropping the tables needs
  // only table ownership, which that role does have, and it leaves the schema
  // and its grants intact so db:grant-app-role has less to rebuild.
  //
  // Types are dropped too: migrations create enums, and a leftover type would
  // make the re-run fail on `create type`.
  process.stdout.write(`\n── dropping every table in "${dbName}"\n`);

  const { rows: tables } = await client.query(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  if (tables.length) {
    const list = tables.map((r) => `public."${r.tablename}"`).join(', ');
    // One statement so foreign keys between them cannot block the order.
    await client.query(`drop table if exists ${list} cascade`);
  }
  console.log(`   dropped ${tables.length} table(s)`);

  const { rows: types } = await client.query(
    `select t.typname
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'`,
  );
  for (const { typname } of types) {
    await client.query(`drop type if exists public."${typname}" cascade`);
  }
  if (types.length) console.log(`   dropped ${types.length} type(s)`);
} finally {
  await client.end();
}

run('applying all migrations', 'npm', ['run', '--silent', 'db:migrate']);
run('granting the app role', 'npm', ['run', '--silent', 'db:grant-app-role']);

// Order matters: the core seed creates the organization, locations and the
// staff those later seeds attach to.
const seeds = [
  ['core shop, staff and services', 'src/seed.ts', true],
  ['extra services and products', 'src/seed-more-catalog.ts', true],
  ['extra staff', 'src/seed-more-staff.ts', true],
  ['clients', 'src/seed-more-clients.ts', true],
  ['tax identities', 'src/seed-tax-identities.ts', false],
  ['history at the other locations', 'src/seed-more-locations-history.ts', false],
  ["today's board", 'src/seed-fresh-board.ts', true],
];

for (const [label, file, required] of seeds) {
  const args = ['ts-node', '--transpile-only', '-r', 'tsconfig-paths/register', file];
  if (required) run(label, 'npx', args, { cwd: API });
  else runOptional(label, 'npx', args, { cwd: API });
}

console.log(`\nDone. "${dbName}" is freshly migrated and seeded.`);
if (skipped.length) console.log(`Skipped (optional): ${skipped.join(', ')}`);
console.log('Point the API at it (DATABASE_URL uses salon_app, DATABASE_MIGRATE_URL uses the owner) and redeploy.');
