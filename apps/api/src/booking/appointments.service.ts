import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../common/request-context';
import { QueueService } from '../queue/queue.service';
import { intervalsOverlap } from './booking.rules';

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
    const dateKey = startsAt.toISOString().slice(0, 10);
    await sql`select pg_advisory_xact_lock(hashtext(${`${locationStaffId}:${dateKey}`}))`.execute(trx);
    const dayStart = new Date(`${dateKey}T00:00:00`);
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

    await trx.updateTable('appointments').set({ starts_at: startsAt, location_staff_id: locationStaffId, service_id: serviceIds[0] }).where('id', '=', appointmentId).execute();
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

  async cancel(locationId: string, actorUserId: string, appointmentId: string) {
    const trx = db();
    const updated = await trx.updateTable('appointments').set({ status: 'cancelled', cancelled_at: new Date() }).where('id', '=', appointmentId).where('location_id', '=', locationId).where('status', 'in', ['booked', 'confirmed']).returning('id').executeTakeFirst();
    if (!updated) return { changed: false };
    const linkedEntry = await trx.selectFrom('queue_entries').select(['id', 'present']).where('appointment_id', '=', appointmentId).where('status', 'in', ['waiting', 'in_service']).executeTakeFirst();
    if (linkedEntry && !linkedEntry.present) await this.queue.cancel(locationId, linkedEntry.id, actorUserId);
    return { changed: true };
  }
}
