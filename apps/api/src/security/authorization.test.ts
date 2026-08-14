import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { StaffRole } from '../db/kysely.types';
import type { AuthClaims } from '../auth/auth.types';
import { requestContextStorage, requireAuth, requireFrontDeskOrManager, requireManager, requireOwner } from '../common/request-context';

/**
 * Closes launch-readiness gap #3 (endpoint authorization matrix + automated
 * negative tests) and its risk note F ("authorization is real but unproven —
 * a missing guard on one route is invisible").
 *
 * Two layers:
 *  1. The role-guard primitives enforce the right tier for every role (negative
 *     tests: a barber cannot pass a manager gate).
 *  2. Source-level invariants over every controller so a NEW route or controller
 *     cannot ship without an explicit auth guard, and the crown-jewel operations
 *     stay manager-only.
 */

const ALL_ROLES: StaffRole[] = ['org_owner', 'location_manager', 'staff', 'front_desk'];

function makeAuth(role: StaffRole): AuthClaims {
  return { userId: 'u', locationStaffId: 'ls', organizationId: 'org', locationId: 'loc', role, fullName: 'Test User' };
}

// require*() read the auth off AsyncLocalStorage; run them inside a scope. They
// never touch the db handle, so a stub trx is fine.
function runAs<T>(auth: AuthClaims | null, fn: () => T): T {
  return requestContextStorage.run({ trx: {} as never, auth }, fn);
}

describe('role-guard primitives (negative matrix)', () => {
  it('requireAuth throws with no session, returns the claims for any role', () => {
    expect(() => runAs(null, requireAuth)).toThrow();
    for (const role of ALL_ROLES) {
      expect(runAs(makeAuth(role), requireAuth).role).toBe(role);
    }
  });

  it('requireManager admits only org_owner and location_manager', () => {
    const allowed: StaffRole[] = ['org_owner', 'location_manager'];
    for (const role of ALL_ROLES) {
      if (allowed.includes(role)) {
        expect(runAs(makeAuth(role), requireManager).role).toBe(role);
      } else {
        expect(() => runAs(makeAuth(role), requireManager)).toThrow(ForbiddenException);
      }
    }
    expect(() => runAs(null, requireManager)).toThrow();
  });

  it('requireOwner admits only the organization owner', () => {
    for (const role of ALL_ROLES) {
      if (role === 'org_owner') {
        expect(runAs(makeAuth(role), requireOwner).role).toBe(role);
      } else {
        expect(() => runAs(makeAuth(role), requireOwner)).toThrow(ForbiddenException);
      }
    }
    expect(() => runAs(null, requireOwner)).toThrow();
  });

  it('requireFrontDeskOrManager admits owner/manager/front_desk but not staff (barber)', () => {
    const allowed: StaffRole[] = ['org_owner', 'location_manager', 'front_desk'];
    for (const role of ALL_ROLES) {
      if (allowed.includes(role)) {
        expect(runAs(makeAuth(role), requireFrontDeskOrManager).role).toBe(role);
      } else {
        expect(() => runAs(makeAuth(role), requireFrontDeskOrManager)).toThrow(ForbiddenException);
      }
    }
    expect(() => runAs(null, requireFrontDeskOrManager)).toThrow();
  });
});

// ---- Source-level controller invariants ---------------------------------

// Resolve the API src root from the working directory (vitest runs with cwd at
// the package dir; fall back to the monorepo-relative path if invoked from root).
// Avoids import.meta (the API compiles to CommonJS) and __dirname (unset under vitest ESM).
const SRC_ROOT = [resolve(process.cwd(), 'src'), resolve(process.cwd(), 'apps/api/src')].find((c) => existsSync(join(c, 'app.module.ts'))) ?? resolve(process.cwd(), 'src');

/** Controllers that are intentionally unauthenticated. Adding a controller here
 *  is a deliberate, reviewable decision — the default (not listed) must be guarded. */
const PUBLIC_CONTROLLERS = new Set(['health.controller.ts', 'booking.controller.ts', 'auth.controller.ts', 'public-complaints.controller.ts']);

const HTTP_DECORATOR = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;

interface Handler { method: string; path: string; body: string; }

function listControllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listControllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/** Split a controller source into per-route handler chunks (decorator → next decorator). */
function handlersOf(src: string): Handler[] {
  const marks: { i: number; method: string; path: string }[] = [];
  let m: RegExpExecArray | null;
  HTTP_DECORATOR.lastIndex = 0;
  while ((m = HTTP_DECORATOR.exec(src))) marks.push({ i: m.index, method: m[1], path: m[2].replace(/['"`]/g, '').trim() });
  return marks.map((mark, k) => ({ method: mark.method, path: mark.path, body: src.slice(mark.i, k + 1 < marks.length ? marks[k + 1].i : src.length) }));
}

const controllerFiles = listControllerFiles(SRC_ROOT);
const REQUIRE_GUARD = /require(Auth|Manager|Owner|FrontDeskOrManager)\s*\(/;

describe('controller authorization coverage', () => {
  it('discovers every controller in the source tree', () => {
    const names = controllerFiles.map((f) => f.split('/').pop());
    expect(names).toContain('queue.controller.ts');
    expect(names).toContain('settings.controller.ts');
    expect(controllerFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('every controller is either PUBLIC-listed or session-guarded with @UseGuards(AuthGuard)', () => {
    for (const file of controllerFiles) {
      const name = file.split('/').pop()!;
      const src = readFileSync(file, 'utf8');
      if (PUBLIC_CONTROLLERS.has(name)) {
        expect(src.includes('@UseGuards(AuthGuard)'), `${name} is PUBLIC-listed but also declares AuthGuard — resolve the contradiction`).toBe(false);
      } else {
        expect(src.includes('@UseGuards(AuthGuard)'), `${name} has no @UseGuards(AuthGuard) and is not PUBLIC-listed — every new controller must be one or the other`).toBe(true);
      }
    }
  });

  it('every route in a guarded controller asserts an auth tier (requireAuth/Manager/FrontDeskOrManager)', () => {
    for (const file of controllerFiles) {
      const name = file.split('/').pop()!;
      if (PUBLIC_CONTROLLERS.has(name)) continue;
      const handlers = handlersOf(readFileSync(file, 'utf8'));
      expect(handlers.length, `${name} should expose routes`).toBeGreaterThan(0);
      for (const h of handlers) {
        expect(REQUIRE_GUARD.test(h.body), `${name}: ${h.method} '${h.path}' has no require* guard — it would run for any authenticated role`).toBe(true);
      }
    }
  });
});

// Crown-jewel operations that must never drop below manager. Keyed by controller
// file and a substring of the route path; the matching handler must call requireManager.
const MANAGER_ONLY: { file: string; method: string; pathIncludes: string }[] = [
  { file: 'payments.controller.ts', method: 'Post', pathIncludes: 'refund' },
  { file: 'payments.controller.ts', method: 'Post', pathIncludes: 'close-shop' },
  { file: 'schedule.controller.ts', method: 'Post', pathIncludes: 'publish' },
  { file: 'schedule.controller.ts', method: 'Post', pathIncludes: 'requests/:id/approve' },
  { file: 'schedule.controller.ts', method: 'Post', pathIncludes: 'requests/:id/deny' },
  { file: 'settings.controller.ts', method: 'Put', pathIncludes: 'feature-settings' },
  { file: 'settings.controller.ts', method: 'Post', pathIncludes: 'pay-models' },
  { file: 'settings.controller.ts', method: 'Post', pathIncludes: 'job-roles' },
  { file: 'reports.controller.ts', method: 'Post', pathIncludes: 'staff-pay-runs' },
];

describe('crown-jewel operations stay manager-only', () => {
  for (const rule of MANAGER_ONLY) {
    it(`${rule.file} ${rule.method} …${rule.pathIncludes}… requires manager`, () => {
      const file = controllerFiles.find((f) => f.endsWith(rule.file));
      expect(file, `${rule.file} not found`).toBeTruthy();
      const handler = handlersOf(readFileSync(file!, 'utf8')).find((h) => h.method === rule.method && h.path.includes(rule.pathIncludes));
      expect(handler, `no ${rule.method} route matching '${rule.pathIncludes}' in ${rule.file}`).toBeTruthy();
      expect(/requireManager\s*\(/.test(handler!.body), `${rule.method} '${handler!.path}' in ${rule.file} must call requireManager`).toBe(true);
    });
  }
});
