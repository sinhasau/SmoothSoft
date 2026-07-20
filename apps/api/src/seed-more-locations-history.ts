/**
 * Eastside and Westfield were seeded with only a roster/schedule — no
 * transaction or queue history, unlike Downtown (whose history came from
 * live app testing during development). That made both locations look
 * "broken" once cross-location viewing actually worked: nothing to show.
 *
 * This backfills ~30 days of realistic queue_entries/transactions/
 * transaction_items for both locations, sets a distinct barber-request
 * pricing policy per location for a meaningful demo of all three modes,
 * and promotes Downtown's Alex to org_owner so there's an account that can
 * actually view other locations (see rls-transaction.middleware.ts).
 *
 * Additive; safe to re-run — skips a location if it already has
 * transactions, and pricing-policy/role changes are plain upserts.
 */
import './env';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db/kysely.types';

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

const DAYS_OF_HISTORY = 30;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

async function seedLocationHistory(locationName: string, orgId: string, discountCode: string) {
  const location = await db.selectFrom('locations').selectAll().where('organization_id', '=', orgId).where('name', '=', locationName).executeTakeFirstOrThrow();

  const existingTxn = await db.selectFrom('transactions').select('id').where('location_id', '=', location.id).executeTakeFirst();
  if (existingTxn) {
    console.log(`${locationName} already has transaction history — skipping.`);
    return;
  }

  const staff = await db
    .selectFrom('location_staff as ls')
    .innerJoin('users as u', 'u.id', 'ls.user_id')
    .select(['ls.id as locationStaffId', 'u.full_name as fullName'])
    .where('ls.location_id', '=', location.id)
    .execute();

  const services = await db.selectFrom('services').selectAll().where('location_id', '=', location.id).execute();
  const products = await db.selectFrom('products').selectAll().where('location_id', '=', location.id).execute();
  const taxConfig = await db.selectFrom('tax_config').selectAll().where('location_id', '=', location.id).executeTakeFirstOrThrow();
  const clients = await db.selectFrom('clients').select(['id', 'organization_id']).where('organization_id', '=', orgId).execute();

  const code = await db
    .insertInto('discount_codes')
    .values({ location_id: location.id, code: discountCode, discount_type: 'percent', value: 10, active: true })
    .returningAll()
    .executeTakeFirstOrThrow();

  let discountUses = 0;
  let entriesCreated = 0;
  let transactionsCreated = 0;

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    const entriesToday = randomInt(1, 5);
    for (let i = 0; i < entriesToday; i++) {
      const staffMember = pick(staff);
      const service = pick(services);
      const client = pick(clients);
      const requestedSpecific = Math.random() < 0.25;
      const hour = randomInt(9, 17);
      const minute = randomInt(0, 59);
      const createdAt = new Date(day);
      createdAt.setHours(hour, minute, 0, 0);

      const outcomeRoll = Math.random();
      const status = outcomeRoll < 0.82 ? 'completed' : outcomeRoll < 0.9 ? 'no_show' : 'cancelled';
      const abandoned = status === 'cancelled' && outcomeRoll >= 0.96;

      const entry = await db
        .insertInto('queue_entries')
        .values({
          location_id: location.id,
          client_id: client.id,
          service_id: service.id,
          status,
          assigned_location_staff_id: staffMember.locationStaffId,
          requested_specific_staff: requestedSpecific,
          present: true,
          present_checked_at: createdAt,
          abandoned,
          created_at: createdAt,
          updated_at: createdAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      entriesCreated++;

      if (status !== 'completed') continue;

      const applyDiscount = Math.random() < 0.15;
      const addRetail = Math.random() < 0.3 && products.length > 0;
      const product = addRetail ? pick(products) : null;

      const servicePrice = Number(service.price);
      const retailPrice = product ? Number(product.price) : 0;
      const subtotal = servicePrice + retailPrice;
      const taxableAmount = (taxConfig.services_taxable ? servicePrice : 0) + retailPrice;
      const discountAmount = applyDiscount ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
      const tax = Math.round(taxableAmount * (Number(taxConfig.retail_tax_pct) / 100) * 100) / 100;
      const tip = Math.round(servicePrice * (randomInt(12, 22) / 100) * 100) / 100;
      const total = Math.round((subtotal - discountAmount + tax + tip) * 100) / 100;
      const paymentMethod = Math.random() < 0.55 ? 'cash' : 'card';

      const transaction = await db
        .insertInto('transactions')
        .values({
          location_id: location.id,
          client_id: client.id,
          location_staff_id: staffMember.locationStaffId,
          queue_entry_id: entry.id,
          subtotal,
          tax,
          tip,
          total,
          payment_method: paymentMethod,
          discount_code_id: applyDiscount ? code.id : null,
          discount_amount: discountAmount,
          created_at: createdAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      transactionsCreated++;
      if (applyDiscount) discountUses++;

      const items: { name: string; item_type: 'service' | 'retail'; price: number; taxable: boolean }[] = [
        { name: service.name, item_type: 'service', price: servicePrice, taxable: taxConfig.services_taxable },
      ];
      if (product) items.push({ name: product.name, item_type: 'retail', price: retailPrice, taxable: true });
      await db.insertInto('transaction_items').values(items.map((item) => ({ transaction_id: transaction.id, ...item }))).execute();
    }
  }

  if (discountUses > 0) {
    await db.updateTable('discount_codes').set({ usage_count: discountUses }).where('id', '=', code.id).execute();
  }

  console.log(`${locationName}: ${entriesCreated} queue entries, ${transactionsCreated} transactions over ${DAYS_OF_HISTORY} days.`);
}

async function main() {
  const org = await db.selectFrom('organizations').selectAll().where('name', '=', "JJ's Barbers").executeTakeFirst();
  if (!org) throw new Error("No organization named \"JJ's Barbers\" found — run `npm run seed` first.");

  await seedLocationHistory('Eastside', org.id, 'EASTSIDE10');
  await seedLocationHistory('Westfield', org.id, 'WESTFIELD10');

  // Distinct pricing-policy demo per location: Downtown = same (default,
  // no row needed), Eastside = per-staff tier, Westfield = flat surcharge.
  const eastside = await db.selectFrom('locations').selectAll().where('organization_id', '=', org.id).where('name', '=', 'Eastside').executeTakeFirstOrThrow();
  const westfield = await db.selectFrom('locations').selectAll().where('organization_id', '=', org.id).where('name', '=', 'Westfield').executeTakeFirstOrThrow();

  await db
    .insertInto('location_pricing_policy')
    .values({ location_id: eastside.id, barber_request_mode: 'per_staff' })
    .onConflict((oc) => oc.column('location_id').doUpdateSet({ barber_request_mode: 'per_staff' }))
    .execute();
  await db
    .insertInto('location_pricing_policy')
    .values({ location_id: westfield.id, barber_request_mode: 'flat', flat_surcharge_amount: 5 })
    .onConflict((oc) => oc.column('location_id').doUpdateSet({ barber_request_mode: 'flat', flat_surcharge_amount: 5 }))
    .execute();

  const eastsideLead = await db
    .selectFrom('location_staff as ls')
    .innerJoin('users as u', 'u.id', 'ls.user_id')
    .select('ls.id as locationStaffId')
    .where('ls.location_id', '=', eastside.id)
    .where('u.full_name', '=', 'Devon Ellis')
    .executeTakeFirst();
  if (eastsideLead) {
    await db.updateTable('location_staff').set({ price_tier_amount: 8 }).where('id', '=', eastsideLead.locationStaffId).execute();
  }

  // Promote Downtown's Alex to org_owner so there's a login that can
  // actually exercise cross-location viewing (nothing in the base seed had
  // this role).
  const downtown = await db.selectFrom('locations').selectAll().where('organization_id', '=', org.id).where('name', '=', 'Downtown').executeTakeFirstOrThrow();
  const alex = await db
    .selectFrom('location_staff as ls')
    .innerJoin('users as u', 'u.id', 'ls.user_id')
    .select('ls.id as locationStaffId')
    .where('ls.location_id', '=', downtown.id)
    .where('u.full_name', '=', 'Alex')
    .executeTakeFirst();
  if (alex) {
    await db.updateTable('location_staff').set({ role: 'org_owner' }).where('id', '=', alex.locationStaffId).execute();
    console.log('Promoted Alex (Downtown) to org_owner.');
  }

  console.log('Done.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().finally(() => process.exit(1));
  });
