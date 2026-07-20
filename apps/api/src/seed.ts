/**
 * Seeds the reference shop (JJ's Barbers) for local development.
 *
 * Connects via DATABASE_MIGRATE_URL (the table-owning role), deliberately
 * bypassing RLS — appropriate for a trusted, operator-run seed script in
 * the same way migrations are, but never used by the running application
 * (see db/README.md).
 *
 * Downtown's roster/schedule is seeded to match the reference screenshots
 * exactly (Kim/Joel/Alex/Joshua, same weekly pattern, Alex's pending
 * one-off "requested off" for the Monday after next). Eastside/Westfield
 * get a smaller, illustrative roster — the handoff's 6-person roster
 * (HANDOFF-master.md §3) doesn't have enough people to exactly fill the
 * headcounts shown in the org-dashboard mockup across 3 locations, and the
 * mockup itself was never wired to real data, so those two locations are
 * approximate, not pixel-matched.
 */
import './env';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB, StaffClassification, StaffRole } from './db/kysely.types';

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

interface StaffSeed {
  fullName: string;
  role: StaffRole;
  classification: StaffClassification;
  commissionPct?: number;
  boothRentWeekly?: number;
  schedule: { day: number; start: string; end: string }[];
}

const DOWNTOWN_ROSTER: StaffSeed[] = [
  {
    fullName: 'Kim',
    role: 'staff',
    classification: 'w2',
    commissionPct: 50,
    schedule: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
  {
    fullName: 'Joel',
    role: 'staff',
    classification: '1099',
    boothRentWeekly: 250,
    schedule: [2, 3, 4, 5, 6].map((day) => ({ day, start: '10:00', end: '18:00' })),
  },
  {
    fullName: 'Alex',
    role: 'location_manager',
    classification: 'w2',
    commissionPct: 55,
    schedule: [0, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
  {
    fullName: 'Joshua',
    role: 'staff',
    classification: 'w2',
    commissionPct: 50,
    schedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
];

const EASTSIDE_ROSTER: StaffSeed[] = [
  {
    fullName: 'Rory',
    role: 'staff',
    classification: '1099',
    boothRentWeekly: 250,
    schedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
  {
    fullName: 'Devon Ellis',
    role: 'location_manager',
    classification: 'w2',
    commissionPct: 50,
    schedule: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
  {
    fullName: 'Sam Ortiz',
    role: 'staff',
    classification: 'w2',
    commissionPct: 50,
    schedule: [2, 3, 4, 5, 6].map((day) => ({ day, start: '10:00', end: '18:00' })),
  },
];

const WESTFIELD_ROSTER: StaffSeed[] = [
  {
    fullName: 'Madelyn',
    role: 'location_manager',
    classification: 'w2',
    commissionPct: 50,
    schedule: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
  {
    fullName: 'Priya Nair',
    role: 'staff',
    classification: 'w2',
    commissionPct: 50,
    schedule: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
  {
    fullName: 'Chris Bell',
    role: 'staff',
    classification: '1099',
    boothRentWeekly: 250,
    schedule: [2, 3, 4, 5, 6].map((day) => ({ day, start: '10:00', end: '18:00' })),
  },
  {
    fullName: 'Jordan Lee',
    role: 'staff',
    classification: 'w2',
    commissionPct: 50,
    schedule: [0, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
  },
];

const SERVICES = [
  { name: 'Haircut', duration_minutes: 20, price: 28 },
  { name: 'Beard trim', duration_minutes: 12, price: 15 },
  { name: 'Haircut + beard trim', duration_minutes: 30, price: 40 },
];

async function seedLocation(organizationId: string, name: string, roster: StaffSeed[]) {
  const location = await db
    .insertInto('locations')
    .values({ organization_id: organizationId, name })
    .returningAll()
    .executeTakeFirstOrThrow();

  await db
    .insertInto('services')
    .values(SERVICES.map((s) => ({ location_id: location.id, ...s })))
    .execute();

  // Store hours: open 9-6 every day except Sunday (matches the schedule
  // screenshot, where Sunday only has one barber working 9-5).
  await db
    .insertInto('store_hours')
    .values(
      Array.from({ length: 7 }, (_, day) => ({
        location_id: location.id,
        day_of_week: day,
        is_open: true,
        open_time: '09:00',
        close_time: day === 0 ? '17:00' : '18:00',
      })),
    )
    .execute();

  await db
    .insertInto('tax_config')
    .values({ location_id: location.id, retail_tax_pct: 6, services_taxable: false })
    .execute();

  await db.insertInto('queue_config').values({ location_id: location.id }).execute();

  await db
    .insertInto('location_goals')
    .values({
      location_id: location.id,
      daily_revenue_per_barber: 350,
      clients_per_day_per_barber: 10,
      tip_rate_pct: 18,
      utilization_target_pct: 80,
    })
    .execute();

  await db
    .insertInto('payment_processor_config')
    .values({ location_id: location.id, active_processor: 'external' })
    .execute();

  const staffIds: Record<string, string> = {};

  for (const person of roster) {
    const user = await db
      .insertInto('users')
      .values({ full_name: person.fullName })
      .returningAll()
      .executeTakeFirstOrThrow();

    const locationStaff = await db
      .insertInto('location_staff')
      .values({
        location_id: location.id,
        user_id: user.id,
        role: person.role,
        classification: person.classification,
        is_primary: true,
        status: 'off',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    staffIds[person.fullName] = locationStaff.id;

    await db
      .insertInto('staff_compensation_history')
      .values({
        location_staff_id: locationStaff.id,
        classification: person.classification,
        commission_pct: person.commissionPct ?? null,
        booth_rent_weekly: person.boothRentWeekly ?? null,
      })
      .execute();

    await db
      .insertInto('staff_goals')
      .values({
        location_staff_id: locationStaff.id,
        daily_revenue: 350,
        clients_per_day: 10,
      })
      .execute();

    if (person.schedule.length > 0) {
      await db
        .insertInto('staff_schedule_days')
        .values(
          person.schedule.map((s) => ({
            location_staff_id: locationStaff.id,
            day_of_week: s.day,
            start_time: s.start,
            end_time: s.end,
          })),
        )
        .execute();
    }
  }

  return { location, staffIds };
}

async function main() {
  console.log('Seeding JJ\'s Barbers...');

  const org = await db
    .insertInto('organizations')
    .values({ name: "JJ's Barbers", legal_structure: 'llc', allow_staff_multi_location: false })
    .returningAll()
    .executeTakeFirstOrThrow();

  const downtown = await seedLocation(org.id, 'Downtown', DOWNTOWN_ROSTER);
  await seedLocation(org.id, 'Eastside', EASTSIDE_ROSTER);
  await seedLocation(org.id, 'Westfield', WESTFIELD_ROSTER);

  // Compliance alert matching the reference screenshot: "Joel's insurance
  // certificate expires in 12 days."
  const expiresIn12Days = new Date();
  expiresIn12Days.setDate(expiresIn12Days.getDate() + 12);
  await db
    .insertInto('compliance_documents')
    .values({
      location_id: downtown.location.id,
      location_staff_id: downtown.staffIds['Joel'],
      doc_type: 'insurance_certificate',
      description: '1099 booth renter proof of insurance, due for renewal.',
      expires_at: expiresIn12Days.toISOString().slice(0, 10),
      status: 'needs_attention',
    })
    .execute();

  // Matches the Eastside "Overdue" pill in the owner dashboard screenshot.
  const eastsideLocation = await db
    .selectFrom('locations')
    .selectAll()
    .where('organization_id', '=', org.id)
    .where('name', '=', 'Eastside')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('compliance_documents')
    .values({
      location_id: eastsideLocation.id,
      location_staff_id: null,
      doc_type: 'sanitation_log',
      description: 'Sanitation log not updated in 40 days.',
      expires_at: null,
      status: 'overdue',
    })
    .execute();

  // Alex's pending one-off "requested off" for the Monday after next,
  // matching the amber "requested off" cell in the schedule screenshot.
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7) + 7);
  await db
    .insertInto('schedule_change_requests')
    .values({
      location_staff_id: downtown.staffIds['Alex'],
      location_id: downtown.location.id,
      request_type: 'one_time',
      status: 'pending',
      work_date: nextMonday.toISOString().slice(0, 10),
      is_working: false,
      reason: 'Personal day',
    })
    .execute();

  // Location sequence counters — required before the first event write.
  const allLocations = await db.selectFrom('locations').select('id').where('organization_id', '=', org.id).execute();
  await db
    .insertInto('location_sequence_counters')
    .values(allLocations.map((l) => ({ location_id: l.id, next_value: 1 })))
    .execute();

  console.log(`Seeded organization ${org.name} (${org.id})`);
  console.log('Locations: Downtown, Eastside, Westfield');
  console.log('Run `npm run dev` in apps/api, then GET /auth/roster to see login options.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().finally(() => process.exit(1));
  });
