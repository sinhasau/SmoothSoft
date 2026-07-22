/**
 * Adds 6 more staff to every existing location under "JJ's Barbers"
 * (on top of seed.ts's original roster). Additive, not idempotent by
 * name (staff names aren't unique in the schema the way phone numbers
 * are for clients) — safe to run once; re-running will add a second
 * batch of the same names as new people, so don't re-run casually.
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
  employmentStatus?: 'active' | 'inactive' | 'resigned';
  commissionPct?: number;
  boothRentWeekly?: number;
  schedule: { day: number; start: string; end: string }[];
}

function mwf(): { day: number; start: string; end: string }[] {
  return [1, 3, 5].map((day) => ({ day, start: '09:00', end: '17:00' }));
}
function tuThSa(): { day: number; start: string; end: string }[] {
  return [2, 4, 6].map((day) => ({ day, start: '10:00', end: '18:00' }));
}
function weekdays(): { day: number; start: string; end: string }[] {
  return [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' }));
}

const DOWNTOWN_EXTRA: StaffSeed[] = [
  { fullName: 'Marcus Reid', role: 'staff', classification: 'w2', commissionPct: 50, schedule: [1, 3, 5].map((day) => ({ day, start: '09:00', end: '17:00' })).concat([{ day: 4, start: '09:00', end: '13:00' }]) },
  { fullName: 'Tasha Freeman', role: 'staff', classification: '1099', employmentStatus: 'resigned', boothRentWeekly: 250, schedule: tuThSa() },
  { fullName: 'Nico Alvarado', role: 'staff', classification: 'w2', commissionPct: 50, schedule: [2, 3, 6].map((day) => ({ day, start: '09:00', end: '17:00' })).concat([{ day: 5, start: '09:00', end: '13:00' }]) },
  { fullName: 'Brianna Cole', role: 'staff', classification: 'w2', commissionPct: 55, schedule: [0, 1, 2, 3, 4].map((day) => ({ day, start: '09:00', end: '17:00' })) },
  { fullName: 'Deshawn Grant', role: 'staff', classification: '1099', boothRentWeekly: 250, schedule: [{ day: 2, start: '10:00', end: '18:00' }, { day: 4, start: '13:00', end: '18:00' }, { day: 6, start: '10:00', end: '18:00' }] },
  { fullName: 'Olivia Marsh', role: 'staff', classification: 'w2', employmentStatus: 'inactive', commissionPct: 50, schedule: mwf() },
];

const EASTSIDE_EXTRA: StaffSeed[] = [
  { fullName: 'Trey Holloway', role: 'staff', classification: 'w2', commissionPct: 50, schedule: [0, 1, 2].map((day) => ({ day, start: '09:00', end: '17:00' })) },
  { fullName: 'Camille Dupree', role: 'staff', classification: '1099', boothRentWeekly: 250, schedule: [3, 4, 5].map((day) => ({ day, start: '10:00', end: '18:00' })) },
  { fullName: 'Rashad Bell', role: 'staff', classification: 'w2', commissionPct: 50, schedule: [0, 5, 6].map((day) => ({ day, start: '09:00', end: '17:00' })) },
  { fullName: 'Yasmin Ortiz', role: 'staff', classification: 'w2', commissionPct: 55, schedule: [1, 2, 3].map((day) => ({ day, start: '09:00', end: '17:00' })) },
  { fullName: 'Cole Bennett', role: 'staff', classification: '1099', boothRentWeekly: 250, schedule: [4, 5, 6].map((day) => ({ day, start: '10:00', end: '18:00' })) },
  { fullName: 'Nadia Farouk', role: 'staff', classification: 'w2', commissionPct: 50, schedule: [0, 6].map((day) => ({ day, start: '09:00', end: '17:00' })) },
];

const WESTFIELD_EXTRA: StaffSeed[] = [
  { fullName: 'Julian Ashford', role: 'staff', classification: 'w2', commissionPct: 50, schedule: weekdays() },
  { fullName: 'Simone Blake', role: 'staff', classification: '1099', boothRentWeekly: 250, schedule: tuThSa() },
  { fullName: 'Desmond Ruiz', role: 'staff', classification: 'w2', commissionPct: 50, schedule: mwf() },
  { fullName: 'Harper Nolan', role: 'staff', classification: 'w2', commissionPct: 55, schedule: weekdays() },
  { fullName: 'Aaron Whitfield', role: 'staff', classification: '1099', boothRentWeekly: 250, schedule: tuThSa() },
  { fullName: 'Zara Ibrahim', role: 'staff', classification: 'w2', commissionPct: 50, schedule: mwf() },
];

async function addStaffToLocation(locationId: string, roster: StaffSeed[]) {
  for (const person of roster) {
    const user = await db.insertInto('users').values({ full_name: person.fullName }).returningAll().executeTakeFirstOrThrow();

    const locationStaff = await db
      .insertInto('location_staff')
      .values({
        location_id: locationId,
        user_id: user.id,
        role: person.role,
        classification: person.classification,
        employment_status: person.employmentStatus ?? 'active',
        is_primary: true,
        status: 'off',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto('staff_compensation_history')
      .values({
        location_staff_id: locationStaff.id,
        classification: person.classification,
        commission_pct: person.commissionPct ?? null,
        booth_rent_weekly: person.boothRentWeekly ?? null,
      })
      .execute();

    await db.insertInto('staff_goals').values({ location_staff_id: locationStaff.id, daily_revenue: 350, clients_per_day: 10 }).execute();

    await db
      .insertInto('staff_schedule_days')
      .values(person.schedule.map((s) => ({ location_staff_id: locationStaff.id, day_of_week: s.day, start_time: s.start, end_time: s.end })))
      .execute();
  }
}

async function main() {
  const locations = await db
    .selectFrom('locations as l')
    .innerJoin('organizations as o', 'o.id', 'l.organization_id')
    .select(['l.id as id', 'l.name as name'])
    .where('o.name', '=', "JJ's Barbers")
    .execute();

  const byName: Record<string, StaffSeed[]> = {
    Downtown: DOWNTOWN_EXTRA,
    Eastside: EASTSIDE_EXTRA,
    Westfield: WESTFIELD_EXTRA,
  };

  for (const location of locations) {
    const roster = byName[location.name];
    if (!roster) {
      console.log(`No extra roster defined for location "${location.name}" — skipping.`);
      continue;
    }
    await addStaffToLocation(location.id, roster);
    console.log(`Added ${roster.length} staff to ${location.name}.`);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().finally(() => process.exit(1));
  });
