import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { normalizePhone } from '../common/phone';
import type { ComplaintStatus } from '../db/kysely.types';

export interface SubmitComplaintDto {
  name?: string;
  phone?: string;
  message?: string;
}

@Injectable()
export class ComplaintsService {
  /** Public submission from the standalone feedback page. Location is RLS-scoped by the
   *  public_booking_scope() path in rls-transaction.middleware.ts. */
  async submit(locationId: string, dto: SubmitComplaintDto) {
    const name = dto.name?.trim();
    const message = dto.message?.trim();
    if (!name) throw new BadRequestException('Please tell us your name.');
    if (!message || message.length < 3) throw new BadRequestException('Please describe what went wrong.');
    if (message.length > 2000) throw new BadRequestException('That message is too long — please keep it under 2000 characters.');
    const phone = dto.phone?.trim() || null;

    // Best-effort link to a known profile so staff can pull up history — only when the
    // number matches exactly one client (RLS already scopes clients to this org).
    let clientId: string | null = null;
    const normalized = phone ? normalizePhone(phone) : null;
    if (normalized) {
      const matches = await db().selectFrom('clients').select('id').where('phone_normalized', '=', normalized).limit(2).execute();
      if (matches.length === 1) clientId = matches[0].id;
    }

    const row = await db()
      .insertInto('customer_complaints')
      .values({ location_id: locationId, client_id: clientId, customer_name: name, customer_phone: phone, message })
      .returning(['id', 'created_at as createdAt'])
      .executeTakeFirstOrThrow();
    return { id: row.id, submittedAt: row.createdAt };
  }

  /** The live Manage feed — newest first, with the linked client's real name if any. */
  async list(locationId: string) {
    const rows = await db()
      .selectFrom('customer_complaints as cc')
      .leftJoin('clients as c', 'c.id', 'cc.client_id')
      .leftJoin('users as u', 'u.id', 'cc.handled_by_user_id')
      .select([
        'cc.id', 'cc.customer_name as customerName', 'cc.customer_phone as customerPhone', 'cc.message',
        'cc.status', 'cc.created_at as createdAt', 'cc.resolved_at as resolvedAt',
        'cc.client_id as clientId', 'c.name as clientProfileName', 'u.full_name as handledByName',
      ])
      .where('cc.location_id', '=', locationId)
      .orderBy('cc.created_at', 'desc')
      .limit(200)
      .execute();
    const counts = { new: 0, acknowledged: 0, resolved: 0 } as Record<ComplaintStatus, number>;
    for (const row of rows) counts[row.status as ComplaintStatus]++;
    return { complaints: rows, counts };
  }

  async updateStatus(locationId: string, actorUserId: string, id: string, status: ComplaintStatus) {
    if (!['new', 'acknowledged', 'resolved'].includes(status)) throw new BadRequestException('Invalid status');
    const updated = await db()
      .updateTable('customer_complaints')
      .set({
        status,
        updated_at: new Date(),
        handled_by_user_id: actorUserId,
        resolved_at: status === 'resolved' ? new Date() : null,
      })
      .where('id', '=', id)
      .where('location_id', '=', locationId)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw new NotFoundException('Complaint not found');
    return { changed: true, status };
  }
}
