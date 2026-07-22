import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { normalizePhone } from '../common/phone';
import type { CaptureConsentDto, RebookClientDto, UpdateClientProfileDto } from './clients.types';
import { BookingService } from '../booking/booking.service';

/**
 * Module 6 (CRM) — client profiles as a first-class object, per the fix
 * for the gap flagged in PRD-live-queue-checkin.md §5.4 (see
 * clients/client-lookup.ts for the check-in-time creation path this
 * complements). Clients are organization-scoped, not location-scoped
 * (ARCHITECTURE-data-and-perspectives.md 1.1: "clients belong to the
 * Organization, not to an individual staff member's account").
 */
@Injectable()
export class ClientsService {
  constructor(private readonly booking: BookingService) {}
  async search(organizationId: string, query?: string) {
    let q = db().selectFrom('clients').selectAll().where('organization_id', '=', organizationId);

    if (query && query.trim().length > 0) {
      const normalizedPhone = normalizePhone(query);
      const namePattern = `%${query.trim()}%`;
      q = q.where((eb) =>
        eb.or([
          eb('name', 'ilike', namePattern),
          ...(normalizedPhone.length >= 3 ? [eb('phone_normalized', 'ilike', `%${normalizedPhone}%`)] : []),
        ]),
      );
    }

    return q.orderBy('name').limit(100).execute();
  }

  async getProfile(organizationId: string, clientId: string) {
    const trx = db();
    const client = await trx.selectFrom('clients').selectAll().where('id', '=', clientId).where('organization_id', '=', organizationId).executeTakeFirst();
    if (!client) throw new NotFoundException('Client not found');

    const txns = await trx.selectFrom('transactions').selectAll().where('client_id', '=', clientId).execute();
    const recordedVisits = txns.length;
    const recordedSpend = txns.reduce((s, t) => s + Number(t.total), 0);

    const serviceHistoryLines = await trx
      .selectFrom('transactions as t')
      .innerJoin('transaction_items as ti', 'ti.transaction_id', 't.id')
      .leftJoin('location_staff as ls', 'ls.id', 't.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select(['t.id as transactionId', 't.created_at as date', 'ti.name as serviceName', 'u.full_name as staffName', 'ti.price as price', 't.tip as tip'])
      .where('t.client_id', '=', clientId)
      .where('ti.item_type', '=', 'service')
      .orderBy('t.created_at', 'desc')
      .execute();
    const serviceHistoryMap = new Map<string, { transactionId: string; date: Date; serviceName: string; staffName: string | null; price: string; tip: string }>();
    for (const line of serviceHistoryLines) {
      const existing = serviceHistoryMap.get(line.transactionId);
      if (existing) {
        existing.serviceName = `${existing.serviceName} + ${line.serviceName}`;
        existing.price = String(Number(existing.price) + Number(line.price));
      } else {
        serviceHistoryMap.set(line.transactionId, { ...line });
      }
    }
    const serviceHistory = [...serviceHistoryMap.values()];

    const upcomingAppointments = await trx.selectFrom('appointments as a').innerJoin('services as s', 's.id', 'a.service_id').leftJoin('location_staff as ls', 'ls.id', 'a.location_staff_id').leftJoin('users as u', 'u.id', 'ls.user_id').select(['a.id', 'a.starts_at as startsAt', 'a.status', 'a.notes', 's.name as serviceName', 'u.full_name as staffName']).where('a.client_id', '=', clientId).where('a.starts_at', '>=', new Date()).where('a.status', 'in', ['booked', 'confirmed']).orderBy('a.starts_at').execute();
    const upcomingIds = upcomingAppointments.map((appointment) => appointment.id);
    const upcomingServiceLines = upcomingIds.length ? await trx.selectFrom('appointment_services as aps').innerJoin('services as s', 's.id', 'aps.service_id').select(['aps.appointment_id as appointmentId', 's.name as serviceName', 'aps.sort_order as sortOrder']).where('aps.appointment_id', 'in', upcomingIds).orderBy('aps.sort_order').execute() : [];
    const upcomingNames = new Map<string, string[]>();
    for (const line of upcomingServiceLines) { const names = upcomingNames.get(line.appointmentId) ?? []; names.push(line.serviceName); upcomingNames.set(line.appointmentId, names); }
    const upcomingAppointmentsWithServices = upcomingAppointments.map((appointment) => ({ ...appointment, serviceName: upcomingNames.get(appointment.id)?.join(' + ') ?? appointment.serviceName }));
    const consents = await trx.selectFrom('client_consents').select(['id', 'consent_type as consentType', 'version', 'accepted', 'captured_at as capturedAt', 'notes']).where('client_id', '=', clientId).orderBy('captured_at', 'desc').execute();

    return {
      client,
      recordedVisits,
      recordedSpend,
      recordedSpendCaveat: 'Recorded spend only covers transactions captured in this system — visits from before the system was in use are not included.',
      serviceHistory,
      upcomingAppointments: upcomingAppointmentsWithServices,
      consents,
    };
  }

  async updateProfile(organizationId: string, clientId: string, dto: UpdateClientProfileDto) {
    const trx = db();
    const existing = await trx.selectFrom('clients').selectAll().where('id', '=', clientId).where('organization_id', '=', organizationId).executeTakeFirst();
    if (!existing) throw new NotFoundException('Client not found');

    const phoneNormalized = dto.phone !== undefined ? normalizePhone(dto.phone) : undefined;

    const updated = await trx
      .updateTable('clients')
      .set({
        name: dto.name ?? existing.name,
        phone_display: dto.phone ?? existing.phone_display,
        phone_normalized: phoneNormalized ?? existing.phone_normalized,
        notes: dto.notes ?? existing.notes,
        allergy_flag: dto.allergyFlag ?? existing.allergy_flag,
        referral_source: dto.referralSource ?? existing.referral_source,
      })
      .where('id', '=', clientId)
      .returningAll()
      .executeTakeFirstOrThrow();

    if (phoneNormalized && phoneNormalized !== existing.phone_normalized) {
      await trx.updateTable('phone_bindings').set({ superseded_at: new Date() }).where('client_id', '=', clientId).where('superseded_at', 'is', null).execute();
      await trx.insertInto('phone_bindings').values({ phone_normalized: phoneNormalized, client_id: clientId }).execute();
    }

    return updated;
  }


  async captureConsent(organizationId: string, clientId: string, actorUserId: string, dto: CaptureConsentDto) {
    if (!dto.consentType?.trim() || !dto.version?.trim()) throw new BadRequestException('consentType and version are required');
    const client = await db().selectFrom('clients').select('id').where('id', '=', clientId).where('organization_id', '=', organizationId).executeTakeFirst();
    if (!client) throw new NotFoundException('Client not found');
    return db().insertInto('client_consents').values({ organization_id: organizationId, client_id: clientId, consent_type: dto.consentType.trim(), version: dto.version.trim(), accepted: dto.accepted, captured_by_user_id: actorUserId, notes: dto.notes ?? null }).returningAll().executeTakeFirstOrThrow();
  }

  async rebook(organizationId: string, locationId: string, clientId: string, actorUserId: string, dto: RebookClientDto) {
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) throw new BadRequestException('startsAt must be a future date and time');
    const trx = db();
    const client = await trx.selectFrom('clients').select('id').where('id', '=', clientId).where('organization_id', '=', organizationId).executeTakeFirst();
    if (!client) throw new NotFoundException('Client not found');
    const serviceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : [dto.serviceId])];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const services = await trx.selectFrom('services').select('id').where('id', 'in', serviceIds).where('location_id', '=', locationId).execute();
    if (services.length !== serviceIds.length) throw new BadRequestException('One or more services are not available at this location');
    const available = await this.booking.slots(locationId, serviceIds, startsAt.toISOString().slice(0, 10), dto.locationStaffId ?? undefined);
    const candidate = available.slots.find((slot) => slot.startsAt === startsAt.toISOString() && (!dto.locationStaffId || slot.locationStaffId === dto.locationStaffId));
    if (!candidate) throw new ConflictException('That time is not available for the selected services. Choose another time or professional.');
    const appointment = await trx.insertInto('appointments').values({ location_id: locationId, client_id: clientId, service_id: serviceIds[0], location_staff_id: candidate.locationStaffId, starts_at: startsAt, source: 'staff_rebook', notes: dto.notes ?? null, created_by_user_id: actorUserId }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('appointment_services').values(serviceIds.map((serviceId, sortOrder) => ({ appointment_id: appointment.id, service_id: serviceId, sort_order: sortOrder }))).execute();
    return appointment;
  }

  async cancelAppointment(organizationId: string, locationId: string, clientId: string, appointmentId: string) {
    const trx = db();
    const client = await trx.selectFrom('clients').select('id').where('id', '=', clientId).where('organization_id', '=', organizationId).executeTakeFirst();
    if (!client) throw new NotFoundException('Client not found');
    const appointment = await trx.updateTable('appointments').set({ status: 'cancelled', cancelled_at: new Date() }).where('id', '=', appointmentId).where('client_id', '=', clientId).where('location_id', '=', locationId).where('status', 'in', ['booked', 'confirmed']).returningAll().executeTakeFirst();
    if (!appointment) throw new NotFoundException('Upcoming appointment not found');
    return appointment;
  }
}
