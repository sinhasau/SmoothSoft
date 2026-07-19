import type { Pool, PoolClient } from 'pg';
import type { Kysely } from 'kysely';
import { kyselyFromClient } from './kysely-from-client';
import type { DB } from './kysely.types';

/**
 * Escape hatch for the Owner cross-location dashboard, which legitimately
 * needs to read multiple locations in one request. The main request's RLS
 * transaction (rls-transaction.middleware.ts) is scoped to exactly one
 * location, by design — that's what keeps every other endpoint from
 * accidentally reading across tenants.
 *
 * Rather than weaken any RLS policy to make cross-location reads easier,
 * this opens one extra short-lived transaction per location, each with its
 * own SET LOCAL, and the caller aggregates results in application code.
 * Every read still goes through RLS; nothing here bypasses it.
 */
export async function runInLocationScope<T>(
  pool: Pool,
  organizationId: string,
  locationId: string,
  fn: (trx: Kysely<DB>) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  // Fresh capture every call — see rls-transaction.middleware.ts for why
  // this must never be cached on the shared Client instance.
  const releaseToPool = client.release.bind(client);
  client.release = (() => {}) as PoolClient['release'];
  try {
    await client.query('BEGIN');
    // see rls-transaction.middleware.ts for why set_config(), not SET LOCAL $1
    await client.query("select set_config('app.current_organization_id', $1, true)", [organizationId]);
    await client.query("select set_config('app.current_location_id', $1, true)", [locationId]);
    const trx = kyselyFromClient(client);
    const result = await fn(trx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    releaseToPool();
  }
}
