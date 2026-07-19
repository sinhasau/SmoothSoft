import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { normalizePhone } from '../common/phone';
import type { UpdateClientProfileDto } from './clients.types';

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

    const serviceHistory = await trx
      .selectFrom('transactions as t')
      .innerJoin('transaction_items as ti', 'ti.transaction_id', 't.id')
      .leftJoin('location_staff as ls', 'ls.id', 't.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select(['t.id as transactionId', 't.created_at as date', 'ti.name as serviceName', 'u.full_name as staffName', 'ti.price as price', 't.tip as tip'])
      .where('t.client_id', '=', clientId)
      .where('ti.item_type', '=', 'service')
      .orderBy('t.created_at', 'desc')
      .execute();

    return {
      client,
      recordedVisits,
      recordedSpend,
      recordedSpendCaveat: 'Recorded spend only covers transactions captured in this system — visits from before the system was in use are not included.',
      serviceHistory,
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
}
