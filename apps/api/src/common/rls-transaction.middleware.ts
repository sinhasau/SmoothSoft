import { ForbiddenException, Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../auth/jwt';
import { kyselyFromClient } from '../db/kysely-from-client';
import { PG_POOL } from '../db/database.module';
import { requestContextStorage } from './request-context';

const LOCATION_OVERRIDE_HEADER = 'x-location-id';

/**
 * The single place that implements the handoff's explicit RLS warning
 * (docs/ARCHITECTURE-data-and-perspectives.md 1.7, SCALING-AND-INDEXING-NOTES.md §3):
 *
 *   "Use SET LOCAL inside every transaction. Test with two concurrent
 *   simulated tenants before production."
 *
 * For every request:
 *   1. Check out ONE client from the pool (not a fresh Kysely-per-query).
 *   2. BEGIN.
 *   3. If the request is authenticated, SET LOCAL app.current_organization_id
 *      and SET LOCAL app.current_location_id from the verified session
 *      cookie — never from a client-supplied header/body value.
 *   4. Hand a Kysely instance bound to that exact client to the rest of the
 *      request via AsyncLocalStorage, so every service just calls db()
 *      instead of threading a connection through every function signature.
 *   5. COMMIT on a successful response, ROLLBACK on an error or a >=500,
 *      then release the client back to the pool.
 *
 * Deliberately plain Express middleware + res 'finish'/'close' events
 * rather than a Nest Interceptor: interceptors model the response as an
 * RxJS Observable, which is a worse fit for "hold a transaction open across
 * the handler and close it exactly once when the HTTP response is actually
 * done," including on client disconnect.
 */
@Injectable()
export class RlsTransactionMiddleware implements NestMiddleware {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    let client: PoolClient;
    let releaseToPool: () => void;
    try {
      client = await this.pool.connect();
      // Capture pg-pool's real release closure FRESH on every checkout —
      // it rebinds a new one each time a Client instance is reused, so
      // this must never be cached across requests (see kysely-from-client.ts
      // for the bug this fixes). Kysely will call client.release() as part
      // of its own connection-management bookkeeping; neutering it here
      // means that call is harmless, and this function is the only thing
      // that can actually return the connection to the pool.
      releaseToPool = client.release.bind(client);
      client.release = (() => {}) as PoolClient['release'];
    } catch (err) {
      next(err as Error);
      return;
    }

    let settled = false;
    const finish = async (commit: boolean) => {
      if (settled) return;
      settled = true;
      try {
        await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      } catch {
        // connection is already broken; nothing more we can do with it
      } finally {
        releaseToPool();
      }
    };

    try {
      await client.query('BEGIN');

      const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
      const auth = token ? verifySessionToken(token) : null;
      let effectiveLocationId = auth?.locationId;

      if (auth) {
        // `SET LOCAL x = $1` is rejected by Postgres — SET is a utility
        // statement and doesn't accept bind parameters in that position.
        // set_config(name, value, is_local) is the parameterized
        // equivalent (is_local=true behaves exactly like SET LOCAL,
        // scoped to the current transaction only).
        await client.query("select set_config('app.current_organization_id', $1, true)", [
          auth.organizationId,
        ]);

        // Every location-scoped page is served from a URL like
        // /locations/:locationId/... — the frontend sends that id back as
        // X-Location-Id (see apps/web/lib/api.ts setActiveLocationId).
        // Only org_owner may ever have that resolve to somewhere other
        // than their own location: everyone else is pinned to the
        // location baked into their signed cookie, full stop.
        const requestedLocationId = req.header(LOCATION_OVERRIDE_HEADER);

        if (requestedLocationId && requestedLocationId !== auth.locationId) {
          if (auth.role !== 'org_owner') {
            throw new ForbiddenException('Not permitted to access this location.');
          }
          // locations already has org_isolation RLS keyed on the org
          // session var set above, so this only returns a row if the
          // requested location actually belongs to this organization.
          const target = await client.query('select id from locations where id = $1', [requestedLocationId]);
          if (target.rows.length === 0) {
            throw new ForbiddenException('Location not found in this organization.');
          }
          effectiveLocationId = requestedLocationId;
        }

        await client.query("select set_config('app.current_location_id', $1, true)", [effectiveLocationId]);
      }

      const trx = kyselyFromClient(client);

      res.once('finish', () => {
        void finish(res.statusCode < 500);
      });
      res.once('close', () => {
        void finish(false);
      });

      // Every controller reads requireAuth().locationId as ITS query
      // filter, not just as an RLS session var — so the effective (possibly
      // overridden) location has to flow through here too, or the RLS scope
      // and the explicit `where location_id = ...` clauses disagree and
      // every query returns nothing. locationStaffId/userId/role are left
      // untouched: those still refer to the real logged-in person.
      const effectiveAuth = auth ? { ...auth, locationId: effectiveLocationId as string } : auth;

      requestContextStorage.run({ trx, auth: effectiveAuth }, () => next());
    } catch (err) {
      await finish(false);
      next(err as Error);
    }
  }
}
