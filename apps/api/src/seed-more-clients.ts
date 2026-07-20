/**
 * Adds 30 illustrative clients to the existing seeded organization, for
 * populating the Clients tab and search with realistic volume. Additive
 * and idempotent by phone number — safe to re-run; existing clients
 * (matched by normalized phone) are skipped rather than duplicated.
 *
 * Unlike seed.ts, this does NOT create a new organization — it looks up
 * "JJ's Barbers" and attaches to it. Run seed.ts first.
 */
import './env';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db/kysely.types';
import { normalizePhone } from './common/phone';

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

const REFERRAL_SOURCES = ['walk_by', 'friend_referral', 'instagram', 'google_search', 'returning_client'];

const CLIENTS: { name: string; phone: string; referralSource: string; allergyFlag?: boolean; notes?: string }[] = [
  { name: 'James Whitfield', phone: '313-555-0142', referralSource: 'friend_referral' },
  { name: 'Devante Brooks', phone: '313-555-0198', referralSource: 'instagram' },
  { name: 'Miguel Torres', phone: '313-555-0117', referralSource: 'walk_by' },
  { name: 'Andre Simmons', phone: '313-555-0163', referralSource: 'google_search' },
  { name: 'Terrence Boyd', phone: '313-555-0184', referralSource: 'returning_client' },
  { name: 'Kevin Nakamura', phone: '313-555-0129', referralSource: 'friend_referral' },
  { name: 'Marcus Hill', phone: '313-555-0155', referralSource: 'instagram' },
  { name: 'Elijah Carter', phone: '313-555-0171', referralSource: 'walk_by' },
  { name: 'Omar Rasheed', phone: '313-555-0203', referralSource: 'google_search' },
  { name: 'Trevor Adams', phone: '313-555-0146', referralSource: 'returning_client' },
  { name: 'Julian Mercer', phone: '313-555-0189', referralSource: 'friend_referral', allergyFlag: true, notes: 'Sensitive to certain pomades — check before applying product.' },
  { name: 'Isaiah Coleman', phone: '313-555-0112', referralSource: 'instagram' },
  { name: 'Ricardo Alvarez', phone: '313-555-0177', referralSource: 'walk_by' },
  { name: 'Nathaniel Price', phone: '313-555-0134', referralSource: 'google_search' },
  { name: 'Darius Fields', phone: '313-555-0166', referralSource: 'returning_client' },
  { name: 'Cameron Wells', phone: '313-555-0192', referralSource: 'friend_referral' },
  { name: 'Anthony Reyes', phone: '313-555-0125', referralSource: 'instagram' },
  { name: 'Malik Johnson', phone: '313-555-0158', referralSource: 'walk_by', notes: 'Regular every 3 weeks, prefers a low fade.' },
  { name: 'Xavier Nguyen', phone: '313-555-0141', referralSource: 'google_search' },
  { name: 'Brandon Kelly', phone: '313-555-0173', referralSource: 'returning_client' },
  { name: 'Gabriel Santos', phone: '313-555-0119', referralSource: 'friend_referral' },
  { name: 'Corey Washington', phone: '313-555-0187', referralSource: 'instagram' },
  { name: 'Tyrell Banks', phone: '313-555-0104', referralSource: 'walk_by' },
  { name: 'Jordan Meyers', phone: '313-555-0196', referralSource: 'google_search', allergyFlag: true, notes: 'Reacted to a beard oil in the past — patch test before any new product.' },
  { name: 'Sean Patterson', phone: '313-555-0138', referralSource: 'returning_client' },
  { name: 'Damon Ellison', phone: '313-555-0162', referralSource: 'friend_referral' },
  { name: 'Preston Okafor', phone: '313-555-0181', referralSource: 'instagram' },
  { name: 'Vincent Cruz', phone: '313-555-0107', referralSource: 'walk_by' },
  { name: 'Elliot Zhang', phone: '313-555-0149', referralSource: 'google_search' },
  { name: 'Marquis Dunbar', phone: '313-555-0176', referralSource: 'returning_client' },
];

async function main() {
  const org = await db.selectFrom('organizations').selectAll().where('name', '=', "JJ's Barbers").executeTakeFirst();
  if (!org) {
    throw new Error("No organization named \"JJ's Barbers\" found — run `npm run seed` first.");
  }

  let created = 0;
  let skipped = 0;

  for (const c of CLIENTS) {
    const phoneNormalized = normalizePhone(c.phone);
    const existing = await db
      .selectFrom('clients')
      .select('id')
      .where('organization_id', '=', org.id)
      .where('phone_normalized', '=', phoneNormalized)
      .executeTakeFirst();

    if (existing) {
      skipped++;
      continue;
    }

    const client = await db
      .insertInto('clients')
      .values({
        organization_id: org.id,
        name: c.name,
        phone_normalized: phoneNormalized,
        phone_display: c.phone,
        referral_source: c.referralSource,
        allergy_flag: c.allergyFlag ?? false,
        notes: c.notes ?? null,
        last_confirmed_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('phone_bindings').values({ phone_normalized: phoneNormalized, client_id: client.id }).execute();
    created++;
  }

  console.log(`Created ${created} clients, skipped ${skipped} already on file, for ${org.name}.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().finally(() => process.exit(1));
  });
