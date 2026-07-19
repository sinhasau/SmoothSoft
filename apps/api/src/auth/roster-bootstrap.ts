import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB } from '../db/kysely.types';

/**
 * The one deliberate exception to "the app only ever connects as salon_app
 * inside an RLS-scoped transaction": rendering the dev login picker needs
 * to list staff *before* any session/location scope exists, which is a
 * chicken-and-egg problem RLS can't solve for a not-yet-authenticated
 * request. Real multi-tenant products have the same pre-auth problem (e.g.
 * "which org does this email belong to") and solve it with a narrow,
 * read-only, explicitly-not-tenant-scoped lookup — this is that, scoped to
 * exactly one SELECT.
 *
 * Connects with the migration-owning role specifically because it needs to
 * read across all organizations/locations, which is exactly what RLS
 * (correctly) prevents salon_app from doing without a location scope.
 * Never used for anything but this one query.
 */
const bootstrapPool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL, max: 2 });
const bootstrapDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: bootstrapPool }) });

export interface RosterEntry {
  locationStaffId: string;
  userId: string;
  fullName: string;
  role: string;
  classification: string | null;
  organizationId: string;
  organizationName: string;
  locationId: string;
  locationName: string;
}

export async function listLoginRoster(): Promise<RosterEntry[]> {
  const rows = await bootstrapDb
    .selectFrom('location_staff as ls')
    .innerJoin('users as u', 'u.id', 'ls.user_id')
    .innerJoin('locations as loc', 'loc.id', 'ls.location_id')
    .innerJoin('organizations as org', 'org.id', 'loc.organization_id')
    .select([
      'ls.id as locationStaffId',
      'u.id as userId',
      'u.full_name as fullName',
      'ls.role as role',
      'ls.classification as classification',
      'org.id as organizationId',
      'org.name as organizationName',
      'loc.id as locationId',
      'loc.name as locationName',
    ])
    .orderBy('org.name')
    .orderBy('loc.name')
    .orderBy('u.full_name')
    .execute();

  return rows as unknown as RosterEntry[];
}

export async function lookupStaffForLogin(locationStaffId: string): Promise<RosterEntry | null> {
  const roster = await listLoginRoster();
  return roster.find((r) => r.locationStaffId === locationStaffId) ?? null;
}
