import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../common/request-context';
import { createClient, findClientByPhone } from '../clients/client-lookup';
import { intervalsOverlap, isBookingDate } from './booking.rules';

export interface PublicBookDto {
  name: string;
  phone: string;
  email?: string;
  serviceId: string;
  serviceIds?: string[];
  locationStaffId?: string | null;
  startsAt: string;
  notes?: string;
}

export interface StaffBookDto {
  phone: string;
  newClientName?: string;
  serviceId: string;
  serviceIds?: string[];
  locationStaffId: string;
  startsAt: string;
  notes?: string;
}

@Injectable()
export class BookingService {
  async catalog(locationId: string) {
    const trx = db();
    const [location, services, staff, settings] = await Promise.all([
      trx.selectFrom('locations').select(['id', 'name', 'timezone']).where('id', '=', locationId).executeTakeFirst(),
      trx.selectFrom('services').select(['id', 'name', 'duration_minutes as durationMinutes', 'price']).where('location_id', '=', locationId).orderBy('name').execute(),
      trx.selectFrom('location_staff as ls').innerJoin('users as u', 'u.id', 'ls.user_id').select(['ls.id', 'u.full_name as fullName']).where('ls.location_id', '=', locationId).where('ls.role', 'in', ['org_owner', 'location_manager', 'staff']).orderBy('u.full_name').execute(),
      trx.selectFrom('public_booking_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst(),
    ]);
    if (!location) throw new NotFoundException('Online booking is not available for this location');
    return { location, services, staff, settings: { minimumLeadHours: settings?.minimum_lead_hours ?? 2, bookingHorizonDays: settings?.booking_horizon_days ?? 60, slotIntervalMinutes: settings?.slot_interval_minutes ?? 30 } };
  }

  async slots(locationId: string, requestedServiceIds: string[], date: string, locationStaffId?: string) {
    if (!isBookingDate(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    const trx = db();
    const serviceIds = [...new Set(requestedServiceIds.filter(Boolean))];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const services = await trx.selectFrom('services').selectAll().where('id', 'in', serviceIds).where('location_id', '=', locationId).execute();
    if (services.length !== serviceIds.length) throw new NotFoundException('One or more services are unavailable');
    const visitDurationMinutes = services.reduce((sum, service) => sum + service.duration_minutes, 0);
    const catalog = await this.catalog(locationId);
    const startDay = new Date(`${date}T00:00:00`);
    const minStart = new Date(Date.now() + catalog.settings.minimumLeadHours * 3600000);
    const maxDate = new Date(Date.now() + catalog.settings.bookingHorizonDays * 86400000);
    if (startDay > maxDate) return { slots: [] };
    const dow = startDay.getDay();
    const specialHours = await trx.selectFrom('location_special_hours').selectAll().where('location_id', '=', locationId).where('special_date', '=', date).executeTakeFirst();
    if (specialHours?.is_closed) return { slots: [] };
    const staff = locationStaffId ? catalog.staff.filter((person) => person.id === locationStaffId) : catalog.staff;
    const rows: { startsAt: string; locationStaffId: string; staffName: string }[] = [];
    for (const person of staff) {
      const [exception, recurring, appointments] = await Promise.all([
        trx.selectFrom('schedule_exceptions').selectAll().where('location_staff_id', '=', person.id).where('work_date', '=', date).executeTakeFirst(),
        trx.selectFrom('staff_schedule_days').selectAll().where('location_staff_id', '=', person.id).where('day_of_week', '=', dow).executeTakeFirst(),
        trx.selectFrom('appointments as a').innerJoin('services as booked_service', 'booked_service.id', 'a.service_id').select(['a.id as id', 'a.starts_at as startsAt', 'booked_service.duration_minutes as primaryDurationMinutes']).where('a.location_staff_id', '=', person.id).where('a.starts_at', '>=', startDay).where('a.starts_at', '<', new Date(startDay.getTime() + 86400000)).where('a.status', 'in', ['booked', 'confirmed']).execute(),
      ]);
      const shift = exception ? (exception.is_working ? exception : null) : recurring;
      if (!shift?.start_time || !shift.end_time) continue;
      const [sh, sm] = shift.start_time.split(':').map(Number);
      const [eh, em] = shift.end_time.split(':').map(Number);
      const specialStart = specialHours?.open_time ? specialHours.open_time.split(':').map(Number) : null;
      const specialEnd = specialHours?.close_time ? specialHours.close_time.split(':').map(Number) : null;
      const operatingStart = Math.max(sh * 60 + sm, specialStart ? specialStart[0] * 60 + specialStart[1] : 0);
      const operatingEnd = Math.min(eh * 60 + em, specialEnd ? specialEnd[0] * 60 + specialEnd[1] : 24 * 60);
      const appointmentIds = appointments.map((appointment) => appointment.id);
      const bookedLines = appointmentIds.length
        ? await trx.selectFrom('appointment_services as aps').innerJoin('services as booked_service', 'booked_service.id', 'aps.service_id').select(['aps.appointment_id as appointmentId', 'booked_service.duration_minutes as durationMinutes']).where('aps.appointment_id', 'in', appointmentIds).execute()
        : [];
      const bookedDuration = new Map<string, number>();
      for (const line of bookedLines) bookedDuration.set(line.appointmentId, (bookedDuration.get(line.appointmentId) ?? 0) + line.durationMinutes);
      for (let minutes = operatingStart; minutes + visitDurationMinutes <= operatingEnd; minutes += catalog.settings.slotIntervalMinutes) {
        const startsAt = new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`);
        if (startsAt < minStart) continue;
        const overlaps = appointments.some((appt) => intervalsOverlap(startsAt, visitDurationMinutes, new Date(appt.startsAt), bookedDuration.get(appt.id) ?? appt.primaryDurationMinutes));
        if (!overlaps) rows.push({ startsAt: startsAt.toISOString(), locationStaffId: person.id, staffName: person.fullName });
      }
    }
    return { slots: rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
  }

  async book(locationId: string, dto: PublicBookDto) {
    if (!dto.name?.trim() || !dto.phone?.trim()) throw new BadRequestException('Name and phone are required');
    const trx = db();
    const requestedStart = new Date(dto.startsAt);
    if (Number.isNaN(requestedStart.getTime())) throw new BadRequestException('A valid appointment time is required');
    const serviceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : [dto.serviceId])];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const initial = await this.slots(locationId, serviceIds, dto.startsAt.slice(0, 10), dto.locationStaffId ?? undefined);
    const candidate = initial.slots.find((slot) => slot.startsAt === requestedStart.toISOString() && (!dto.locationStaffId || slot.locationStaffId === dto.locationStaffId));
    if (!candidate) throw new ConflictException('That appointment time is no longer available');

    // Public requests for the same professional/day are serialized inside the
    // request transaction. Availability is checked again after the lock so two
    // customers cannot both claim the final slot.
    await sql`select pg_advisory_xact_lock(hashtext(${`${candidate.locationStaffId}:${dto.startsAt.slice(0, 10)}`}))`.execute(trx);
    const available = await this.slots(locationId, serviceIds, dto.startsAt.slice(0, 10), candidate.locationStaffId);
    if (!available.slots.some((slot) => slot.startsAt === requestedStart.toISOString())) throw new ConflictException('That appointment time was just booked. Please choose another.');

    const location = await trx.selectFrom('locations').select(['organization_id', 'name']).where('id', '=', locationId).executeTakeFirstOrThrow();
    const lookup = await findClientByPhone(trx, location.organization_id, dto.phone);
    const client = lookup.clientId
      ? await trx.selectFrom('clients').selectAll().where('id', '=', lookup.clientId).executeTakeFirstOrThrow()
      : await createClient(trx, { organizationId: location.organization_id, name: dto.name.trim(), phone: dto.phone, referralSource: 'online_booking' });
    if (dto.email) await trx.updateTable('clients').set({ email: dto.email.trim() }).where('id', '=', client.id).execute();
    return this.finalizeAppointment(locationId, {
      clientId: client.id,
      serviceIds,
      locationStaffId: candidate.locationStaffId,
      startsAt: requestedStart,
      source: 'public_booking',
      notes: dto.notes,
      createdByUserId: null,
      destinationPhone: dto.phone,
      locationName: location.name,
    });
  }

  /** Front-desk-created booking (Appointments tab) — same double-booking protection as the
   *  public flow, but skips the public-only minimum-lead-hours/booking-horizon checks since
   *  staff can book same-day or immediately. Appointments require a real client record (no
   *  anonymous "guest" appointments — matches the appointments table's not-null client_id). */
  async createForStaff(locationId: string, actorUserId: string, dto: StaffBookDto) {
    const trx = db();
    const requestedStart = new Date(dto.startsAt);
    if (Number.isNaN(requestedStart.getTime())) throw new BadRequestException('A valid appointment time is required');
    if (requestedStart.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('Appointment time is in the past');
    const serviceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : [dto.serviceId])];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const services = await trx.selectFrom('services').select(['id', 'duration_minutes']).where('id', 'in', serviceIds).where('location_id', '=', locationId).execute();
    if (services.length !== serviceIds.length) throw new NotFoundException('One or more services are unavailable');
    const visitDurationMinutes = services.reduce((sum, s) => sum + s.duration_minutes, 0);
    const staff = await trx.selectFrom('location_staff').select('id').where('id', '=', dto.locationStaffId).where('location_id', '=', locationId).executeTakeFirst();
    if (!staff) throw new NotFoundException('Selected professional was not found at this location');

    const dateKey = dto.startsAt.slice(0, 10);
    await sql`select pg_advisory_xact_lock(hashtext(${`${dto.locationStaffId}:${dateKey}`}))`.execute(trx);

    const dayStart = new Date(`${dateKey}T00:00:00`);
    const existing = await trx.selectFrom('appointments as a').innerJoin('services as booked_service', 'booked_service.id', 'a.service_id')
      .select(['a.id as id', 'a.starts_at as startsAt', 'booked_service.duration_minutes as primaryDurationMinutes'])
      .where('a.location_staff_id', '=', dto.locationStaffId).where('a.starts_at', '>=', dayStart).where('a.starts_at', '<', new Date(dayStart.getTime() + 86400000)).where('a.status', 'in', ['booked', 'confirmed']).execute();
    const existingIds = existing.map((row) => row.id);
    const bookedLines = existingIds.length
      ? await trx.selectFrom('appointment_services as aps').innerJoin('services as booked_service', 'booked_service.id', 'aps.service_id').select(['aps.appointment_id as appointmentId', 'booked_service.duration_minutes as durationMinutes']).where('aps.appointment_id', 'in', existingIds).execute()
      : [];
    const bookedDuration = new Map<string, number>();
    for (const line of bookedLines) bookedDuration.set(line.appointmentId, (bookedDuration.get(line.appointmentId) ?? 0) + line.durationMinutes);
    const overlaps = existing.some((appt) => intervalsOverlap(requestedStart, visitDurationMinutes, new Date(appt.startsAt), bookedDuration.get(appt.id) ?? appt.primaryDurationMinutes));
    if (overlaps) throw new ConflictException('That professional already has an appointment at that time');

    const location = await trx.selectFrom('locations').select(['organization_id', 'name']).where('id', '=', locationId).executeTakeFirstOrThrow();
    const lookup = await findClientByPhone(trx, location.organization_id, dto.phone);
    let clientId: string;
    if (lookup.clientId) {
      clientId = lookup.clientId;
    } else {
      if (!dto.newClientName?.trim()) throw new BadRequestException({ code: 'NEW_CLIENT_NAME_REQUIRED', message: 'This phone number is not on file. Provide a name to create a client profile.' });
      const client = await createClient(trx, { organizationId: location.organization_id, name: dto.newClientName, phone: dto.phone, referralSource: 'staff_booking' });
      clientId = client.id;
    }

    return this.finalizeAppointment(locationId, {
      clientId,
      serviceIds,
      locationStaffId: dto.locationStaffId,
      startsAt: requestedStart,
      source: 'staff_rebook',
      notes: dto.notes,
      createdByUserId: actorUserId,
      destinationPhone: dto.phone,
      locationName: location.name,
    });
  }

  private async finalizeAppointment(locationId: string, params: {
    clientId: string;
    serviceIds: string[];
    locationStaffId: string;
    startsAt: Date;
    source: 'public_booking' | 'staff_rebook';
    notes?: string;
    createdByUserId: string | null;
    destinationPhone: string;
    locationName: string;
  }) {
    const trx = db();
    const confirmationCode = randomBytes(6).toString('hex').toUpperCase();
    const appointment = await trx.insertInto('appointments').values({
      location_id: locationId,
      client_id: params.clientId,
      service_id: params.serviceIds[0],
      location_staff_id: params.locationStaffId,
      starts_at: params.startsAt,
      source: params.source,
      notes: params.notes?.trim() || null,
      created_by_user_id: params.createdByUserId,
      confirmation_code: confirmationCode,
      cancelled_at: null,
    }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('appointment_services').values(params.serviceIds.map((serviceId, sortOrder) => ({ appointment_id: appointment.id, service_id: serviceId, sort_order: sortOrder }))).execute();
    const when = params.startsAt;
    const communicationSettings = await trx.selectFrom('location_communication_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    const messagesEnabled = communicationSettings?.enabled ?? true;
    const messages = [];
    if (messagesEnabled && (communicationSettings?.booking_confirmations ?? true)) messages.push({ location_id: locationId, client_id: params.clientId, appointment_id: appointment.id, channel: 'sms' as const, message_type: 'booking_confirmation' as const, destination: params.destinationPhone, body: `${params.locationName}: your appointment is booked for ${when.toLocaleString()}. Confirmation ${confirmationCode}.`, scheduled_for: new Date(), provider_ref: null, sent_at: null, error_message: null });
    if (messagesEnabled && (communicationSettings?.appointment_reminders ?? true)) messages.push({ location_id: locationId, client_id: params.clientId, appointment_id: appointment.id, channel: 'sms' as const, message_type: 'appointment_reminder' as const, destination: params.destinationPhone, body: `${params.locationName} reminder: your appointment is tomorrow at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, scheduled_for: new Date(Math.max(Date.now(), when.getTime() - 86400000)), provider_ref: null, sent_at: null, error_message: null });
    if (messages.length) await trx.insertInto('communication_messages').values(messages).execute();
    return { appointmentId: appointment.id, confirmationCode, startsAt: appointment.starts_at, messageQueued: messages.length > 0 };
  }
}
