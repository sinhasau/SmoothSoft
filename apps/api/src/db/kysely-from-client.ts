import { Kysely, PostgresDialect } from 'kysely';
import type { PoolClient } from 'pg';
import { DB } from './kysely.types';

/**
 * Binds a Kysely instance to ONE already-connected, already-BEGIN'd pg
 * client, instead of Kysely's usual pool-per-query behavior.
 *
 * Why: RLS's session vars (set via set_config(..., true), the SET LOCAL
 * equivalent — see rls-transaction.middleware.ts) only apply for the
 * remainder of the current transaction, on the current connection. If
 * Kysely pulled a fresh (or different pooled) connection per query, those
 * session variables would not be visible to those queries.
 *
 * Kysely's PostgresDialect expects a pg-Pool-shaped object. We hand it a
 * fake "pool" whose connect() always resolves to the SAME client object
 * (not a copy) and whose end() is a no-op.
 *
 * Does NOT touch client.release() — the caller (rls-transaction.middleware.ts)
 * is responsible for neutralizing/restoring it. Two bugs were found and
 * fixed while wiring this up, both worth the warning for the next person
 * who touches this file:
 *
 *   1. An earlier version returned `Object.create(client)` from connect()
 *      to get a distinct object to override .release() on. That broke in
 *      practice ("Received unexpected rowDescription message from
 *      backend"): pg's Client keeps connection/query-queue state as OWN
 *      properties on the instance, and Object.create() only chains the
 *      prototype — writes to those fields inside pg's internals landed on
 *      the wrapper instead of the real client, desyncing the wire protocol.
 *      Fix: always hand out the literal same `client` reference.
 *
 *   2. An earlier version of the release-neutering lived here, gated by a
 *      "have I already stashed this client's real release" flag stored ON
 *      the client object. That broke on the second request reusing the
 *      same underlying pg Client instance from the pool: pg-pool rebinds a
 *      FRESH `.release` closure on every checkout, but the stash-once guard
 *      skipped re-capturing it, so the second request's cleanup called a
 *      stale closure from the FIRST request's checkout — pg-pool correctly
 *      rejected it ("Release called on client which has already been
 *      released to the pool"). Fix: capture+neutralize release exactly
 *      once per request, in the middleware, right after checkout — never
 *      cache anything about it on the shared Client instance.
 */
export function kyselyFromClient(client: PoolClient): Kysely<DB> {
  const singleClientPool = {
    connect: async () => client,
    end: async () => {},
  };

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: singleClientPool as any }),
  });
}
