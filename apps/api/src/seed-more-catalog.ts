/**
 * Adds 5 retail products and 4 additional services to every existing
 * location under "JJ's Barbers". Additive and idempotent by name — safe
 * to re-run; anything already present (matched by location_id + name) is
 * skipped rather than duplicated.
 */
import './env';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db/kysely.types';

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

const PRODUCTS = [
  { name: 'Matte Pomade', price: 18, stockQty: 24 },
  { name: 'Beard Oil', price: 16, stockQty: 30 },
  { name: 'Daily Shampoo', price: 14, stockQty: 20 },
  { name: 'Boar Bristle Brush', price: 12, stockQty: 15 },
  { name: 'Aftershave Balm', price: 15, stockQty: 18 },
];

const SERVICES = [
  { name: 'Skin fade', duration_minutes: 25, price: 32, taxable: false },
  { name: 'Line-up', duration_minutes: 10, price: 12, taxable: false },
  { name: 'Hot towel shave', duration_minutes: 25, price: 30, taxable: false },
  { name: 'Color / grey blending', duration_minutes: 45, price: 55, taxable: false },
  // seed-fresh-board.ts puts a walk-in on this service, so the catalog has to
  // carry it or that seed fails outright with "No service \"Kids cut\"".
  { name: 'Kids cut', duration_minutes: 15, price: 22, taxable: false },
];

async function main() {
  const locations = await db
    .selectFrom('locations as l')
    .innerJoin('organizations as o', 'o.id', 'l.organization_id')
    .select(['l.id as id', 'l.name as name'])
    .where('o.name', '=', "JJ's Barbers")
    .execute();

  if (locations.length === 0) {
    throw new Error("No locations found for \"JJ's Barbers\" — run `npm run seed` first.");
  }

  let productsCreated = 0;
  let servicesCreated = 0;

  for (const location of locations) {
    for (const p of PRODUCTS) {
      const existing = await db.selectFrom('products').select('id').where('location_id', '=', location.id).where('name', '=', p.name).executeTakeFirst();
      if (existing) continue;
      await db.insertInto('products').values({ location_id: location.id, name: p.name, price: p.price, stock_qty: p.stockQty }).execute();
      productsCreated++;
    }

    for (const s of SERVICES) {
      const existing = await db.selectFrom('services').select('id').where('location_id', '=', location.id).where('name', '=', s.name).executeTakeFirst();
      if (existing) continue;
      await db
        .insertInto('services')
        .values({ location_id: location.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price, taxable: s.taxable })
        .execute();
      servicesCreated++;
    }
  }

  console.log(`Created ${productsCreated} product rows and ${servicesCreated} service rows across ${locations.length} locations.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().finally(() => process.exit(1));
  });
