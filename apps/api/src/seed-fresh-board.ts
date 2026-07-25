/**
 * Refreshes the CURRENT operational board for one location (default: Downtown)
 * with realistic, up-to-the-minute data — the piece the base seed and the
 * 60-day history seed deliberately don't create.
 *
 * Clears the stale live-testing state (active waiting/in-service entries and
 * every appointment at the location, plus their dependents) and seeds a fresh
 * in-service client, a short waiting line, and a few upcoming appointments so
 * the Floor, the customer status view, and the Appointments tab all show
 * sensible wait times / ETAs instead of multi-day / "overdue" leftovers.
 *
 * Fully re-runnable: it deletes-then-inserts, so running it twice is safe and
 * never duplicates or trips the appointment overlap guard (migration 0046).
 * Connects via DATABASE_MIGRATE_URL (owner role), like the other seeds.
 */
import './env';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db/kysely.types';

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

const LOCATION_NAME = process.env.SEED_LOCATION ?? 'Downtown';

async function main() {
  const loc = await db.selectFrom('locations').select(['id', 'organization_id']).where('name', '=', LOCATION_NAME).executeTakeFirstOrThrow();

  const services = await db.selectFrom('services').select(['id', 'name', 'duration_minutes']).where('location_id', '=', loc.id).execute();
  const svc = (name: string) => { const s = services.find((x) => x.name === name); if (!s) throw new Error(`No service "${name}" at ${LOCATION_NAME}`); return s; };

  const staff = await db.selectFrom('location_staff as ls').innerJoin('users as u', 'u.id', 'ls.user_id').select(['ls.id', 'u.full_name as fullName']).where('ls.location_id', '=', loc.id).execute();
  const st = (name: string) => { const s = staff.find((x) => x.fullName === name); if (!s) throw new Error(`No staff "${name}" at ${LOCATION_NAME}`); return s; };

  const clients = await db.selectFrom('clients').select(['id', 'name']).where('organization_id', '=', loc.organization_id).orderBy('created_at').limit(40).execute();
  const client = (name: string, fallbackIndex: number) => clients.find((c) => c.name === name) ?? clients[fallbackIndex % clients.length];

  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const minsAhead = (m: number) => new Date(now.getTime() + m * 60_000);

  // ---------- CLEAN existing operational state for this location ----------
  const activeIds = (await db.selectFrom('queue_entries').select('id').where('location_id', '=', loc.id).where('status', 'in', ['waiting', 'in_service']).execute()).map((r) => r.id);
  if (activeIds.length) {
    await db.deleteFrom('queue_entry_services').where('queue_entry_id', 'in', activeIds).execute();
    await db.deleteFrom('payment_attempts').where('queue_entry_id', 'in', activeIds).execute();
    await db.deleteFrom('queue_entries').where('id', 'in', activeIds).execute();
  }
  await db.deleteFrom('customer_complaints').where('location_id', '=', loc.id).execute();
  const apptIds = (await db.selectFrom('appointments').select('id').where('location_id', '=', loc.id).execute()).map((r) => r.id);
  if (apptIds.length) {
    await db.updateTable('queue_entries').set({ appointment_id: null }).where('appointment_id', 'in', apptIds).execute();
    await db.deleteFrom('communication_messages').where('appointment_id', 'in', apptIds).execute();
    await db.deleteFrom('appointment_services').where('appointment_id', 'in', apptIds).execute();
    await db.deleteFrom('appointments').where('id', 'in', apptIds).execute();
  }

  // ---------- STAFF status: clean baseline ----------
  await db.updateTable('location_staff').set({ status: 'available' }).where('id', 'in', [st('Alex').id, st('Joel').id, st('Kim').id, st('Marcus Reid').id]).execute();

  // ---------- IN SERVICE (Kim, started 8 min ago) ----------
  const haircut = svc('Haircut');
  const inSvc = await db.insertInto('queue_entries').values({
    location_id: loc.id, client_id: client('Marcus J.', 0).id, service_id: haircut.id, status: 'in_service',
    assigned_location_staff_id: st('Kim').id, requested_specific_staff: false, is_appt: false,
    present: true, present_checked_at: minsAgo(20), created_at: minsAgo(20), updated_at: minsAgo(8),
    abandoned: false, service_started_at: minsAgo(8),
  }).returning('id').executeTakeFirstOrThrow();
  await db.insertInto('queue_entry_services').values({ location_id: loc.id, queue_entry_id: inSvc.id, service_id: haircut.id, sort_order: 0 }).execute();
  await db.updateTable('location_staff').set({ status: 'busy' }).where('id', '=', st('Kim').id).execute();

  // ---------- WAITING walk-ins (recent, minute-scale waits) ----------
  const waits = [
    { client: client('James Whitfield', 1), service: svc('Skin fade'), createdMin: 22, present: true },
    { client: client('Devante Brooks', 2), service: svc('Haircut + beard trim'), createdMin: 12, present: true },
    { client: client('Miguel Torres', 3), service: svc('Kids cut'), createdMin: 5, present: false },
  ];
  let order = 0;
  for (const w of waits) {
    const entry = await db.insertInto('queue_entries').values({
      location_id: loc.id, client_id: w.client.id, service_id: w.service.id, status: 'waiting',
      requested_specific_staff: false, is_appt: false, present: w.present,
      present_checked_at: w.present ? minsAgo(w.createdMin) : null,
      created_at: minsAgo(w.createdMin), updated_at: minsAgo(w.createdMin), abandoned: false,
      waiting_order: order, original_waiting_order: order,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('queue_entry_services').values({ location_id: loc.id, queue_entry_id: entry.id, service_id: w.service.id, sort_order: 0 }).execute();
    order++;
  }

  // ---------- UPCOMING APPOINTMENTS (today + tomorrow, non-overlapping) ----------
  const tomorrow10 = new Date(now); tomorrow10.setDate(tomorrow10.getDate() + 1); tomorrow10.setHours(10, 0, 0, 0);
  const appts = [
    { client: client('Terrence Boyd', 4), service: svc('Haircut'), staff: st('Joel'), start: minsAhead(90) },
    { client: client('Kevin Nakamura', 5), service: svc('Skin fade'), staff: st('Alex'), start: minsAhead(150) },
    { client: client('Andre Simmons', 6), service: svc('Haircut + beard trim'), staff: st('Joel'), start: tomorrow10 },
  ];
  for (const a of appts) {
    const ends = new Date(a.start.getTime() + a.service.duration_minutes * 60_000);
    const appt = await db.insertInto('appointments').values({
      location_id: loc.id, client_id: a.client.id, service_id: a.service.id, location_staff_id: a.staff.id,
      starts_at: a.start, ends_at: ends, status: 'booked', source: 'public_booking', created_by_user_id: null,
      confirmation_code: Math.random().toString(16).slice(2, 10).toUpperCase(),
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('appointment_services').values({ appointment_id: appt.id, service_id: a.service.id, sort_order: 0 }).execute();
  }

  // ---------- SAMPLE COMPLAINTS (so the Manage feed shows live data) ----------
  const complaints: { name: string; phone: string | null; message: string; status: 'new' | 'acknowledged'; agoMin: number }[] = [
    { name: 'James Whitfield', phone: '313-555-0142', message: 'Waited about 40 minutes past my estimated time with no update. The cut itself was great though.', status: 'new', agoMin: 8 },
    { name: 'Priya Nair', phone: null, message: 'The waiting area was really cold this morning — might be worth turning the heat up.', status: 'new', agoMin: 35 },
    { name: 'Devante Brooks', phone: '313-555-0198', message: 'Got charged for a beard trim I did not get. Front desk fixed it, but wanted to flag it.', status: 'acknowledged', agoMin: 140 },
  ];
  for (const c of complaints) {
    const linked = clients.find((cl) => cl.name === c.name);
    await db.insertInto('customer_complaints').values({
      location_id: loc.id, client_id: linked?.id ?? null, customer_name: c.name, customer_phone: c.phone,
      message: c.message, status: c.status, created_at: minsAgo(c.agoMin), updated_at: minsAgo(c.agoMin),
    }).execute();
  }

  console.log(`Fresh board seeded for ${LOCATION_NAME}: 1 in service, ${waits.length} waiting, ${appts.length} upcoming appointments, ${complaints.length} complaints.`);
}

main().then(() => pool.end()).catch((err) => { console.error(err); return pool.end().finally(() => process.exit(1)); });
