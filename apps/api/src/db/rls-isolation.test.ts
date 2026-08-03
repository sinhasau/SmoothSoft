/**
 * Row-Level Security is the only thing standing between one barbershop
 * owner's revenue numbers and a competing owner's screen. Everything else —
 * the tenant columns, the scoped transactions in scoped-query.ts, the role
 * check in pool.ts — is scaffolding around these policies actually being
 * present and actually being enforced.
 *
 * Until now none of that was tested. With a single owner on the platform an
 * RLS bug is invisible; with many owners it is a breach. These tests exist so
 * that stops being true.
 *
 * They need a real Postgres — policies are a database behaviour, and mocking
 * them would test nothing. The CI `migrations` job already builds exactly the
 * right database (fresh migrations + salon_app granted), so that is where
 * these run. Without the two URLs below they skip, so `npx vitest run` on a
 * laptop with no database still passes.
 *
 *   RLS_TEST_OWNER_URL  the table-owning role — used ONLY to seed fixtures,
 *                       because RLS is bypassed for a table's owner.
 *   RLS_TEST_APP_URL    the app role (salon_app) — every assertion runs as
 *                       this, because it is what production connects as.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const OWNER_URL = process.env.RLS_TEST_OWNER_URL;
const APP_URL = process.env.RLS_TEST_APP_URL;
const canRun = Boolean(OWNER_URL && APP_URL);

/** Tables intentionally not tenant-scoped, so the coverage sweep skips them. */
const NOT_TENANT_SCOPED = new Set([
  // Global login identity: one user can staff locations across organizations,
  // so this table is scoped by the location_staff join, not by a column.
  'users',
  // The tenancy root itself. An organization row has no organization_id;
  // isolation for it is enforced by the app never listing organizations
  // outside the authenticated owner's own.
  'organizations',
  // Migration bookkeeping (0051). No tenant data, deliberately readable.
  'schema_migrations',
]);

let owner: pg.Client;
let app: pg.Client;

/** Two organizations, each with one location — the whole point is A must never see B. */
const fixture = {
  orgA: '', locA: '', clientA: '',
  orgB: '', locB: '', clientB: '',
};

/**
 * Runs `fn` the way a real request does: inside a transaction with the tenant
 * settings applied via set_config(..., true) — the local-to-transaction form,
 * mirroring scoped-query.ts. Always rolls back, so tests cannot leak state
 * into each other.
 */
async function asTenant<T>(
  organizationId: string,
  locationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await app.query('begin');
  try {
    await app.query("select set_config('app.current_organization_id', $1, true)", [organizationId]);
    await app.query("select set_config('app.current_location_id', $1, true)", [locationId]);
    return await fn();
  } finally {
    await app.query('rollback');
  }
}

describe.skipIf(!canRun)('Row-Level Security tenant isolation', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: OWNER_URL });
    app = new pg.Client({ connectionString: APP_URL });
    await owner.connect();
    await app.connect();

    // Seeded as the owner role on purpose: RLS is bypassed for a table's
    // owner, which is the very property that makes salon_app the only honest
    // role to assert against.
    const mk = async (orgName: string, locName: string) => {
      const { rows: [org] } = await owner.query(
        'insert into organizations (name) values ($1) returning id',
        [orgName],
      );
      const { rows: [loc] } = await owner.query(
        'insert into locations (organization_id, name) values ($1, $2) returning id',
        [org.id, locName],
      );
      const { rows: [client] } = await owner.query(
        'insert into clients (organization_id, name) values ($1, $2) returning id',
        [org.id, `${orgName} regular`],
      );
      await owner.query(
        "insert into queue_entries (location_id, status, client_id) values ($1, 'waiting', $2)",
        [loc.id, client.id],
      );
      await owner.query(
        "insert into transactions (location_id, subtotal, total, payment_method) values ($1, 40, 40, 'cash')",
        [loc.id],
      );
      await owner.query(
        'insert into location_sequence_counters (location_id) values ($1) on conflict do nothing',
        [loc.id],
      );
      return { org: org.id, loc: loc.id, client: client.id };
    };

    const a = await mk('RLS Test Org A', 'A — Main St');
    const b = await mk('RLS Test Org B', 'B — Elm St');
    Object.assign(fixture, {
      orgA: a.org, locA: a.loc, clientA: a.client,
      orgB: b.org, locB: b.loc, clientB: b.client,
    });
  });

  afterAll(async () => {
    if (owner) {
      // Ordered by dependency; the fixtures are the only rows these tests own.
      for (const org of [fixture.orgA, fixture.orgB].filter(Boolean)) {
        await owner.query(
          'delete from transactions where location_id in (select id from locations where organization_id = $1)',
          [org],
        );
        await owner.query(
          'delete from queue_entries where location_id in (select id from locations where organization_id = $1)',
          [org],
        );
        await owner.query(
          'delete from location_sequence_counters where location_id in (select id from locations where organization_id = $1)',
          [org],
        );
        await owner.query('delete from clients where organization_id = $1', [org]);
        await owner.query('delete from locations where organization_id = $1', [org]);
        await owner.query('delete from organizations where id = $1', [org]);
      }
      await owner.end();
    }
    if (app) await app.end();
  });

  describe('the enforcement preconditions', () => {
    // pool.ts checks the connection *string* for the owner role. That catches
    // the obvious mistake but not the subtle one: a role that is superuser or
    // carries BYPASSRLS reads every tenant's data while every policy still
    // looks correct in the schema.
    it('the app role is neither superuser nor BYPASSRLS', async () => {
      const { rows } = await app.query(
        'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
      );
      expect(rows[0].rolsuper).toBe(false);
      expect(rows[0].rolbypassrls).toBe(false);
    });

    it('the app role does not own the tenant tables — an owner bypasses RLS entirely', async () => {
      const { rows } = await app.query(
        `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relkind = 'r' and pg_get_userbyid(c.relowner) = current_user`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  describe('policy coverage — the check that catches the NEXT table', () => {
    // The failure this prevents is not a clever one. It is someone adding a
    // table with a location_id, forgetting the policy, and nobody noticing
    // until two owners are on the platform. Enumerating from the catalog
    // rather than a hand-kept list is the point: a new table is covered by
    // this test the moment it exists.
    it('every table with a tenant column has RLS enabled and at least one policy', async () => {
      const { rows } = await owner.query(
        `select c.relname,
                c.relrowsecurity,
                (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
         where c.relkind = 'r'
         group by c.oid, c.relname, c.relrowsecurity
         having bool_or(a.attname in ('location_id', 'organization_id'))
         order by c.relname`,
      );

      const unprotected = rows
        .filter((r) => !NOT_TENANT_SCOPED.has(r.relname))
        .filter((r) => !r.relrowsecurity || r.policies === 0)
        .map((r) => r.relname);

      expect(unprotected).toEqual([]);
      // Guards against the query itself silently matching nothing and the
      // test passing for the wrong reason.
      expect(rows.length).toBeGreaterThan(30);
    });
  });

  describe('reads — one owner cannot see another', () => {
    const cases: Array<[string, string]> = [
      ['clients', 'organization_id'],
      ['locations', 'organization_id'],
      ['queue_entries', 'location_id'],
      ['transactions', 'location_id'],
      ['location_sequence_counters', 'location_id'],
    ];

    it.each(cases)('%s exposes only the scoped tenant', async (table, column) => {
      const seen = await asTenant(fixture.orgA, fixture.locA, async () => {
        const { rows } = await app.query(`select ${column} from ${table}`);
        return rows.map((r) => r[column]);
      });

      const other = column === 'organization_id' ? fixture.orgB : fixture.locB;
      const mine = column === 'organization_id' ? fixture.orgA : fixture.locA;

      expect(seen).not.toContain(other);
      expect(seen).toContain(mine);
    });

    it('a targeted lookup of another org\'s client returns nothing, not a permission error', async () => {
      // Failing closed *quietly* matters: an error would confirm the row
      // exists, which is itself a small leak across tenants.
      const rows = await asTenant(fixture.orgA, fixture.locA, async () => {
        const res = await app.query('select id from clients where id = $1', [fixture.clientB]);
        return res.rows;
      });
      expect(rows).toEqual([]);
    });
  });

  describe('writes — one owner cannot reach into another', () => {
    it('cannot insert a client into another organization', async () => {
      await expect(
        asTenant(fixture.orgA, fixture.locA, () =>
          app.query('insert into clients (organization_id, name) values ($1, $2)', [
            fixture.orgB,
            'smuggled',
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('cannot update another organization\'s client', async () => {
      const updated = await asTenant(fixture.orgA, fixture.locA, async () => {
        const res = await app.query('update clients set name = $1 where id = $2', [
          'renamed by a stranger',
          fixture.clientB,
        ]);
        return res.rowCount;
      });
      // The row is invisible, so the update matches nothing rather than erroring.
      expect(updated).toBe(0);

      const { rows } = await owner.query('select name from clients where id = $1', [fixture.clientB]);
      expect(rows[0].name).not.toBe('renamed by a stranger');
    });

    it('cannot delete another location\'s queue entry', async () => {
      const deleted = await asTenant(fixture.orgA, fixture.locA, async () => {
        const res = await app.query('delete from queue_entries where location_id = $1', [fixture.locB]);
        return res.rowCount;
      });
      expect(deleted).toBe(0);

      const { rows } = await owner.query(
        'select count(*)::int as n from queue_entries where location_id = $1',
        [fixture.locB],
      );
      expect(rows[0].n).toBe(1);
    });

    it('cannot bump another location\'s event sequence counter', async () => {
      // A corrupted counter silently reorders that shop's append-only event
      // log — the source of truth its entire queue is folded from.
      const before = await owner.query(
        'select next_value from location_sequence_counters where location_id = $1',
        [fixture.locB],
      );
      const bumped = await asTenant(fixture.orgA, fixture.locA, async () => {
        const res = await app.query(
          'update location_sequence_counters set next_value = next_value + 100 where location_id = $1',
          [fixture.locB],
        );
        return res.rowCount;
      });
      expect(bumped).toBe(0);

      const after = await owner.query(
        'select next_value from location_sequence_counters where location_id = $1',
        [fixture.locB],
      );
      expect(after.rows[0].next_value).toBe(before.rows[0].next_value);
    });
  });

  describe('an unscoped connection fails closed', () => {
    // The dangerous regression is not a wrong scope, it is a *missing* one —
    // a code path that forgets to open the RLS transaction at all. That must
    // read nothing, never everything.
    // Two different errors are correct here, depending on session history, and
    // both are fail-closed:
    //   "unrecognized configuration parameter" — nothing ever set it, or
    //   "invalid input syntax for type uuid" — a previous transaction set it,
    //     which leaves the GUC known-but-empty after rollback rather than
    //     undefined. The empty string is what the policy then tries to cast.
    // What must never happen is the query succeeding.
    it('querying a tenant table with no scope set errors rather than returning rows', async () => {
      await app.query('begin');
      try {
        await expect(app.query('select id from clients')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax for type uuid/i,
        );
      } finally {
        await app.query('rollback');
      }
    });

    it('the scope does not survive past its transaction', async () => {
      await asTenant(fixture.orgA, fixture.locA, async () => {
        const { rows } = await app.query('select id from clients');
        expect(rows.length).toBeGreaterThan(0);
      });

      // set_config(..., true) is transaction-local. If someone switched it to
      // a session-level SET, a pooled connection would carry one tenant's
      // scope into the next tenant's request — the worst bug available here.
      await app.query('begin');
      try {
        await expect(app.query('select id from clients')).rejects.toThrow();
      } finally {
        await app.query('rollback');
      }
    });
  });
});
