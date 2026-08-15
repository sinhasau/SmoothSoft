/**
 * The deploy-window sweep: does THIS code still work against the schema that
 * is live right now?
 *
 * Three outages have had the same shape. A migration and the code depending on
 * it ship in one change; the code reaches production first; Postgres raises
 * `undefined_column`; the endpoint 500s. The last one took out every page in
 * the owner workspace at once, because they all hang off `GET /dashboard/org`.
 *
 * Nothing tested this, and nothing could have. The unit suites mock the
 * database. The `migrations` job builds a database with EVERY migration
 * applied — including the one in the same pull request — so the code under
 * test never meets the schema it will actually land on.
 *
 * That gap is what this closes. CI runs this sweep twice against a real
 * database:
 *
 *   base schema  — only the migrations already on the base branch, which is
 *                  what production has during the deploy window. A pull
 *                  request that adds a migration AND code needing it fails
 *                  here, and that failure is the point.
 *   full schema  — every migration including this branch's. Proves the sweep
 *                  itself is sound: a route that fails in BOTH runs is an
 *                  ordinary bug, not an ordering problem.
 *
 * Routes are enumerated from the live Express router rather than a hand-kept
 * list, so an endpoint added next week is covered without anyone remembering
 * to add it. That matters here specifically — the endpoint that broke was one
 * nobody would have thought to list.
 *
 * Skips unless DEPLOY_WINDOW_TEST=1, so `npx vitest run` on a laptop with no
 * database still passes. Same pattern as rls-isolation.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';

const canRun = process.env.DEPLOY_WINDOW_TEST === '1';

/**
 * Routes excluded from the sweep, each for a reason that is about the route
 * and not about the schema. Keep this list short and justified — every entry
 * is a piece of the API this guard stops watching.
 */
const SKIP = new Set([
  // Mutating despite being a GET-shaped export, and slow enough to dominate
  // the job. Its read path is covered by /reports.
  '/reports/export',
  // Returns the current session, so it exercises no schema at all.
  '/auth/me',
]);

interface Session {
  label: string;
  cookie: string;
}

let app: INestApplication;
let base: string;
const sessions: Session[] = [];

/** Every GET route Express knows about, minus the parameterised ones. */
function parameterlessGetRoutes(): string[] {
  const router = (app.getHttpAdapter().getInstance() as { _router?: { stack: unknown[] } })._router;
  if (!router) throw new Error('Could not read the Express router — cannot enumerate routes.');
  const paths = new Set<string>();
  for (const layer of router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>) {
    const route = layer.route;
    if (!route?.methods.get) continue;
    // A parameterised route needs a real id to mean anything, and inventing
    // one would test the 404 path instead of the query. Those are covered by
    // the unit suites; this sweep is about whether the SQL still compiles.
    if (route.path.includes(':') || route.path.includes('*')) continue;
    if (SKIP.has(route.path)) continue;
    paths.add(route.path);
  }
  return [...paths].sort();
}

async function login(locationStaffId: string): Promise<string> {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locationStaffId }),
  });
  if (!response.ok) throw new Error(`Login failed for ${locationStaffId}: ${response.status}`);
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Login returned no session cookie.');
  return cookie.split(';')[0];
}

beforeAll(async () => {
  if (!canRun) return;
  app = await NestFactory.create(AppModule, { cors: false, logger: false });
  app.use(cookieParser());
  await app.listen(0);
  const address = app.getHttpServer().address();
  base = `http://127.0.0.1:${typeof address === 'string' ? 0 : address.port}`;

  // The roster is the one pre-auth query, and it is how the web app's own
  // login picker works — so signing in the way a person does needs no
  // fixtures beyond the seed.
  const rosterResponse = await fetch(`${base}/auth/roster`);
  if (!rosterResponse.ok) throw new Error(`GET /auth/roster failed: ${rosterResponse.status}`);
  const roster = (await rosterResponse.json()) as Array<{ locationStaffId: string; role: string }>;

  // One session per role the seed actually contains, discovered rather than
  // listed — a hardcoded list of role names silently swept nothing when it
  // guessed roles the seed does not have ('front_desk', 'barber'), which is
  // the same rot that makes a hand-kept route list worthless.
  for (const role of [...new Set(roster.map((r) => r.role))].sort()) {
    const person = roster.find((r) => r.role === role)!;
    sessions.push({ label: role, cookie: await login(person.locationStaffId) });
  }
  if (!sessions.some((s) => s.label === 'org_owner')) {
    throw new Error('Seed has no org_owner — the owner workspace would go unswept.');
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe.skipIf(!canRun)('deploy window — every read endpoint survives the live schema', () => {
  it('serves every parameterless GET without a server error, for every role', async () => {
    const routes = parameterlessGetRoutes();
    // A sweep that silently swept nothing would pass forever. Say the size out
    // loud in the CI log, and fail if the router ever comes back near-empty.
    // eslint-disable-next-line no-console
    console.log(`sweeping ${routes.length} GET route(s) × ${sessions.length} role(s): ${sessions.map((s) => s.label).join(', ')}`);
    expect(routes.length).toBeGreaterThan(10);

    const failures: string[] = [];
    for (const session of sessions) {
      for (const path of routes) {
        const response = await fetch(`${base}${path}`, { headers: { cookie: session.cookie } });
        // 4xx is fine and expected — a role that may not see a thing gets 403,
        // a missing query parameter gets 400. Those are the API working.
        //
        // 5xx is not. 500 is the raw `undefined_column`; 503 is
        // rethrowIfSchemaBehind having recognised it and named the migration.
        // Both mean this code cannot run on this schema, which is the whole
        // question being asked.
        if (response.status >= 500) {
          const body = await response.text();
          failures.push(`${session.label} GET ${path} → ${response.status} ${body.slice(0, 300)}`);
        }
      }
    }

    expect(
      failures,
      failures.length
        ? `\n\nThese endpoints do not work against this database's schema:\n\n${failures.join('\n')}\n\n` +
            'If this is the base-schema run, this pull request adds a migration AND code that\n' +
            'needs it. Production runs the new code before the migration is applied, so this is\n' +
            'the outage, reproduced. Split it: land the migration on its own, apply it, then\n' +
            'merge the code. See CLAUDE.md, "Shipping a migration and the code that needs it".\n'
        : '',
    ).toEqual([]);
  }, 300_000);
});
