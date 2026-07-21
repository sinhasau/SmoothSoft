import { Pool, types } from 'pg';

// node-postgres parses DATE columns (OID 1082) into JS Date objects at local
// midnight by default — but every DATE column in kysely.types.ts is typed as
// `DateOnly = ColumnType<string, string, string>`, and several call sites
// build map keys like `${staffId}:${row.work_date}` expecting a plain
// 'YYYY-MM-DD' string. A Date object there stringifies via Date.toString()
// (e.g. "Wed Jul 22 2026 00:00:00 GMT-0400...") instead, so those lookups
// silently never match — found via schedule_exceptions overrides never
// showing up on the grid after being saved. Returning the raw string makes
// the runtime value match what the type system already assumed everywhere.
types.setTypeParser(1082, (val) => val);

/**
 * The single connection pool the app uses. Every pooled client connects as
 * `salon_app` (DATABASE_URL) — a role that does NOT own the tables, which is
 * what makes Postgres actually enforce RLS (see db/README.md "Two things you
 * must get right"). Never point this at DATABASE_MIGRATE_URL.
 */
export function createAppPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (see .env.example)');
  }
  if (connectionString.startsWith('postgres://salon:')) {
    throw new Error(
      'DATABASE_URL is pointed at the table-owning role (salon). The app must use ' +
        'the non-owner salon_app role or Row-Level Security silently does nothing.',
    );
  }
  return new Pool({ connectionString, max: 10 });
}
