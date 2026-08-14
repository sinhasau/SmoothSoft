import { AsyncLocalStorage } from 'node:async_hooks';
import type { Kysely } from 'kysely';
import type { DB } from '../db/kysely.types';
import type { AuthClaims } from '../auth/auth.types';
import { ForbiddenException } from '@nestjs/common';

export interface RequestContext {
  trx: Kysely<DB>;
  auth: AuthClaims | null;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * The one function every service/controller uses to get the
 * request-scoped, RLS-bound database handle. Throws loudly rather than
 * silently falling back to an unscoped connection if called outside a
 * request (e.g. from a background job that forgot to open its own scope)
 * — an unscoped query against a table with RLS enabled just errors instead
 * of ever returning cross-tenant data (verified in db/README.md), but
 * failing at this call site is a clearer signal than that Postgres error.
 */
export function db(): Kysely<DB> {
  const ctx = requestContextStorage.getStore();
  if (!ctx) {
    throw new Error(
      'db() called outside of a request context. Every DB access must happen ' +
        'inside the RlsTransactionMiddleware scope.',
    );
  }
  return ctx.trx;
}

export function currentAuth(): AuthClaims | null {
  return requestContextStorage.getStore()?.auth ?? null;
}

export function requireAuth(): AuthClaims {
  const auth = currentAuth();
  if (!auth) {
    throw new Error('requireAuth() called with no authenticated session in context.');
  }
  return auth;
}

export function requireManager(): AuthClaims {
  const auth = requireAuth();
  if (auth.role !== 'org_owner' && auth.role !== 'location_manager') {
    throw new ForbiddenException('Manager access is required for this action.');
  }
  return auth;
}

export function requireOwner(): AuthClaims {
  const auth = requireAuth();
  if (auth.role !== 'org_owner') {
    throw new ForbiddenException('Organization owner access is required for this action.');
  }
  return auth;
}

/** Read-only operational records used at reception, such as receipts. */
export function requireFrontDeskOrManager(): AuthClaims {
  const auth = requireAuth();
  if (!['org_owner', 'location_manager', 'front_desk'].includes(auth.role)) {
    throw new ForbiddenException('Front desk or manager access is required for this action.');
  }
  return auth;
}
