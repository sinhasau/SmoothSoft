import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../common/request-context';
import { QueueService } from '../queue/queue.service';
import { intervalsOverlap, isAppointmentOverlapError } from './booking.rules';
import { dateInTimezone, instantFromWallClock } from '../common/time';

export interface RescheduleAppointmentDto {
  startsAt?: string;
  locationStaffId?: string;
  serviceIds?: string[];
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly queue: QueueService) {}

  async list(locationId: string) {
    const rows = await db().selectFrom('appointments as a')
      .innerJoin('clients as c', 'c.id', 'a.client_id')
      .innerJoin('services as s', 's.id', 'a.service_id')
      .leftJoin('location_staff as ls', 'ls.id', 'a.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .leftJoin('queue_entries as qe', (join) => join.onRef('qe.appointment_id', '=', 'a.id').on('qe.status', 'in', ['waiting', 'in_service']))
      .select(['a.id', 'a.client_id as clientId', 'c.name as clientName', 'a.starts_at as startsAt', 'a.status', 'a.notes', 'a.source', 'u.full_name as staffName', 'a.location_staff_id as locationStaffId', 'a.service_id as primaryServiceId', 's.name as primaryService', 'qe.id as queueEntryId', 'qe.present as present'])
      .where('a.location_id', '=', locationId)
      .where('a.starts_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .orderBy('a.starts_at')
      .limit(300)
      .execute();
    const ids = rows.map((row) => row.id);
    const lines = ids.length ? await db().selectFrom('appointment_services as aps').innerJoin('services as s', 's.id', 'aps.service_id').select(['aps.appointment_id as appointmentId', 's.id as serviceId', 's.name']).where('aps.appointment_id', 'in', ids).orderBy('aps.sort_order').execute() : [];
    return rows.map((row) => {
      const rowLines = lines.filter((line) => line.appointmentId === row.id);
      const serviceNames = rowLines.map((line) => line.name);
      return {
        ...row,
        serviceIds: rowLines.length ? rowLines.map((line) => line.serviceId) : [row.primaryServiceId],
        serviceNames: serviceNames.length ? serviceNames : [row.primaryService],
        onFloor: !!row.queueEntryId,
        arrived: !!row.present,
      };
    });
  }

  /** Locks + checks for a conflicting appointment for this staff member, excluding the appointment being edited (if any). */
  private async assertSlotAvailable(locationId: string, locationStaffId: string, startsAt: Date, durationMinutes: number, excludeAppointmentId?: string) {
    const trx = db();
    // Same shop-local date key and advisory lock as BookingService, so reschedule and new-booking
    // attempts for the same professional/day serialize against each other (a UTC-date key here
    // would diverge from the tz-local key used there and let both slip through).
    const { timezone } = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
    const dateKey = dateInTimezone(timezone, startsAt);
    await sql`select pg_advisory_xact_lock(hashtext(${`${locationStaffId}:${dateKey}`}))`.execute(trx);
    const [dayYear, dayMonth, dayDate] = dateKey.split('-').map(Number);
    const dayStart = instantFromWallClock(timezone, dayYear, dayMonth, dayDate, 0, 0);
    let query = trx.selectFrom('appointments as a').innerJoin('services as booked_service', 'booked_service.id', 'a.service_id')
      .select(['a.id as id', 'a.starts_at as startsAt', 'booked_service.duration_minutes as primaryDurationMinutes'])
      .where('a.location_staff_id', '=', locationStaffId)
      .where('a.starts_at', '>=', dayStart)
      .where('a.starts_at', '<', new Date(dayStart.getTime() + 86400000))
      .where('a.status', 'in', ['booked', 'confirmed']);
    if (excludeAppointmentId) query = query.where('a.id', '!=', excludeAppointmentId);
    const existing = await query.execute();
    const existingIds = existing.map((row) => row.id);
    const bookedLines = existingIds.length
      ? await trx.selectFrom('appointment_services as aps').innerJoin('services as booked_service', 'booked_service.id', 'aps.service_id').select(['aps.appointment_id as appointmentId', 'booked_service.duration_minutes as durationMinutes']).where('aps.appointment_id', 'in', existingIds).execute()
      : [];
    const bookedDuration = new Map<string, number>();
    for (const line of bookedLines) bookedDuration.set(line.appointmentId, (bookedDuration.get(line.appointmentId) ?? 0) + line.durationMinutes);
    const overlaps = existing.some((appt) => intervalsOverlap(startsAt, durationMinutes, new Date(appt.startsAt), bookedDuration.get(appt.id) ?? appt.primaryDurationMinutes));
    if (overlaps) throw new ConflictException('That professional already has an appointment at that time');
  }

  async reschedule(locationId: string, appointmentId: string, dto: RescheduleAppointmentDto) {
    const trx = db();
    const appointment = await trx.selectFrom('appointments').selectAll().where('id', '=', appointmentId).where('location_id', '=', locationId).executeTakeFirst();
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!['booked', 'confirmed'].includes(appointment.status)) throw new ConflictException(`This appointment is already ${appointment.status.replace('_', ' ')}.`);

    const linkedEntry = await trx.selectFrom('queue_entries').selectAll().where('appointment_id', '=', appointmentId).where('status', 'in', ['waiting', 'in_service']).executeTakeFirst();
    if (linkedEntry?.present) throw new ConflictException('This client is already on the Floor — use Reassign / Change service there instead.');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : appointment.starts_at;
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('A valid appointment time is required');
    const locationStaffId = dto.locationStaffId ?? appointment.location_staff_id;
    if (!locationStaffId) throw new BadRequestException('A professional must be selected');

    const existingLines = await trx.selectFrom('appointment_services').select('service_id').where('appointment_id', '=', appointmentId).orderBy('sort_order').execute();
    const serviceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : (existingLines.length ? existingLines.map((line) => line.service_id) : [appointment.service_id]))];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const services = await trx.selectFrom('services').select(['id', 'duration_minutes']).where('id', 'in', serviceIds).where('location_id', '=', locationId).execute();
    if (services.length !== serviceIds.length) throw new NotFoundException('One or more selected services are unavailable at this location');
    const durationMinutes = services.reduce((sum, s) => sum + s.duration_minutes, 0);

    await this.assertSlotAvailable(locationId, locationStaffId, startsAt, durationMinutes, appointmentId);

    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    await trx.updateTable('appointments').set({ starts_at: startsAt, ends_at: endsAt, location_staff_id: locationStaffId, service_id: serviceIds[0] }).where('id', '=', appointmentId).execute()
      .catch((err) => {
        if (isAppointmentOverlapError(err)) throw new ConflictException('That professional already has an appointment at that time');
        throw err;
      });
    await trx.deleteFrom('appointment_services').where('appointment_id', '=', appointmentId).execute();
    await trx.insertInto('appointment_services').values(serviceIds.map((serviceId, sortOrder) => ({ appointment_id: appointmentId, service_id: serviceId, sort_order: sortOrder }))).execute();

    if (linkedEntry) {
      await trx.updateTable('queue_entries').set({
        appt_at: startsAt,
        assigned_location_staff_id: locationStaffId,
        requested_location_staff_id: locationStaffId,
        service_id: serviceIds[0],
        updated_at: new Date(),
      }).where('id', '=', linkedEntry.id).execute();
      await this.queue.setServiceLines(locationId, linkedEntry.id, serviceIds);
    }
    return { changed: true };
  }

  async noShow(locationId: string, actorUserId: string, appointmentId: string) {
    const trx = db();
    const appointment = await trx.selectFrom('appointments').selectAll().where('id', '=', appointmentId).where('location_id', '=', locationId).executeTakeFirst();
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!['booked', 'confirmed'].includes(appointment.status)) throw new ConflictException(`This appointment is already ${appointment.status.replace('_', ' ')}.`);

    const linkedEntry = await trx.selectFrom('queue_entries').select(['id', 'present']).where('appointment_id', '=', appointmentId).where('status', 'in', ['waiting', 'in_service']).executeTakeFirst();
    if (linkedEntry?.present) throw new ConflictException('This client already checked in — use the Floor to mark them a no-show or abandoned instead.');

    await trx.updateTable('appointments').set({ status: 'no_show' }).where('id', '=', appointmentId).execute();
    if (linkedEntry) await this.queue.noShow(locationId, linkedEntry.id, actorUserId);
    return { changed: true };
  }

  async cancel(locationId: string, actorUserId: string | null, appointmentId: string) {
    const trx = db();
    const updated = await trx.updateTable('appointments').set({ status: 'cancelled', cancelled_at: new Date() }).where('id', '=', appointmentId).where('location_id', '=', locationId).where('status', 'in', ['booked', 'confirmed']).returning('id').executeTakeFirst();
    if (!updated) return { changed: false };
    const linkedEntry = await trx.selectFrom('queue_entries').select(['id', 'present']).where('appointment_id', '=', appointmentId).where('status', 'in', ['waiting', 'in_service']).executeTakeFirst();
    if (linkedEntry && !linkedEntry.present) await this.queue.cancel(locationId, linkedEntry.id, actorUserId);
    return { changed: true };
  }

  /**
   * Customer-facing appointment status via the unguessable appointment UUID in the
   * booking link — returns only scheduling info (time, services, professional), never
   * other client PII. Same capability model as QueueService.publicStatus.
   */
  async publicStatus(locationId: string, appointmentId: string) {
    const trx = db();
    const appointment = await trx.selectFrom('appointments as a')
      .innerJoin('services as s', 's.id', 'a.service_id')
      .leftJoin('location_staff as ls', 'ls.id', 'a.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select(['a.id', 'a.status', 'a.starts_at as startsAt', 'a.confirmation_code as confirmationCode', 'a.location_staff_id as locationStaffId', 'a.service_id as primaryServiceId', 's.name as primaryService', 'u.full_name as staffName'])
      .where('a.id', '=', appointmentId).where('a.location_id', '=', locationId).executeTakeFirst();
    if (!appointment) throw new NotFoundException('Appointment not found');
    const lines = await trx.selectFrom('appointment_services as aps').innerJoin('services as s', 's.id', 'aps.service_id').select(['aps.service_id as serviceId', 's.name']).where('aps.appointment_id', '=', appointmentId).orderBy('aps.sort_order').execute();
    return {
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt,
      confirmationCode: appointment.confirmationCode,
      locationStaffId: appointment.locationStaffId,
      staffName: appointment.staffName,
      serviceIds: lines.length ? lines.map((line) => line.serviceId) : [appointment.primaryServiceId],
      serviceNames: lines.length ? lines.map((line) => line.name) : [appointment.primaryService],
    };
  }

  /** Customer self-cancel of their own appointment via the booking link's appointment UUID (null actor, like publicJoin). */
  async publicCancel(locationId: string, appointmentId: string) {
    return this.cancel(locationId, null, appointmentId);
  }
}
