import { Pool } from 'pg';

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
