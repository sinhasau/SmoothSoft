import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { appendEvent } from './event-log';
import { estimateWaitTimes } from './wait-time';
import { createClient, findClientByPhone, touchClientConfirmed } from '../clients/client-lookup';
import type {
  ChangeServiceDto,
  CheckInDto,
  ReassignDto,
  ReorderDto,
  ReturnToWaitingDto,
  SetStaffStatusDto,
  StartDto,
  TogglePresentDto,
} from './queue.types';
import type { QueueEventType, QueueEntryStatus } from '../db/kysely.types';
import { QueueGateway } from './queue.gateway';

@Injectable()
export class QueueService {
  constructor(private readonly gateway: QueueGateway) {}

  private broadcast(locationId: string) {
    // Fire and forget from the caller's perspective — the board is cheap to
    // recompute and every mutating action ends with this, so connected
    // clients invalidate their query cache instead of polling.
    void this.gateway.broadcastQueueChanged(locationId);
  }

  async getBoard(locationId: string) {
    const trx = db();

    const team = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.status as status', 'ls.role as role'])
      .where('ls.location_id', '=', locationId)
      .orderBy('u.full_name')
      .execute();

    const entryBase = trx
      .selectFrom('queue_entries as qe')
      .leftJoin('clients as c', 'c.id', 'qe.client_id')
      .leftJoin('services as s', 's.id', 'qe.service_id')
      .leftJoin('location_staff as ls', 'ls.id', 'qe.assigned_location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select([
        'qe.id as id',
        'qe.status as status',
        'qe.client_id as clientId',
        'c.name as clientName',
        'qe.guest_name as guestName',
        'qe.service_id as serviceId',
        's.name as serviceName',
        's.duration_minutes as serviceDurationMinutes',
        'qe.assigned_location_staff_id as assignedStaffId',
        'u.full_name as assignedStaffName',
        'qe.requested_specific_staff as requestedSpecificStaff',
        'qe.is_appt as isAppt',
        'qe.appt_at as apptAt',
        'qe.present as present',
        'qe.present_checked_at as presentCheckedAt',
        'qe.waiting_order as waitingOrder',
        'qe.service_notes as serviceNotes',
        'qe.created_at as createdAt',
        'qe.updated_at as updatedAt',
        'qe.original_waiting_order as originalWaitingOrder',
      ]);

    const nowServing = await entryBase.where('qe.location_id', '=', locationId).where('qe.status', '=', 'in_service').execute();

    const waiting = await entryBase
      .where('qe.location_id', '=', locationId)
      .where('qe.status', '=', 'waiting')
      .orderBy('qe.waiting_order')
      .execute();

    const estimates = estimateWaitTimes(
      waiting.map((w) => ({
        queueEntryId: w.id,
        serviceDurationMinutes: w.serviceDurationMinutes ?? 20,
      })),
    );
    const estimateByEntry = new Map(estimates.map((e) => [e.queueEntryId, e.estimatedStart]));

    return {
      team,
      nowServing,
      waiting: waiting.map((w) => ({ ...w, estimatedStart: estimateByEntry.get(w.id) ?? null })),
    };
  }

  async checkIn(locationId: string, organizationId: string, actorUserId: string, dto: CheckInDto) {
    if (dto.isAppointment && !dto.apptAt) {
      throw new BadRequestException('apptAt is required for an appointment check-in');
    }

    const trx = db();

    let clientId: string | null = null;
    let displayName = dto.guestName ?? null;

    if (dto.mode === 'phone') {
      if (!dto.phone) throw new BadRequestException('phone is required when mode is "phone"');

      const lookup = await findClientByPhone(trx, organizationId, dto.phone);

      if (lookup.clientId) {
        if (lookup.isStale && !dto.confirmedStaleMatch) {
          throw new ConflictException({
            code: 'STALE_PHONE_MATCH',
            message: 'This number is on file for a client last confirmed a while ago. Confirm it is the same person, or start a new profile.',
            staleLastConfirmedAt: lookup.staleLastConfirmedAt,
          });
        }
        clientId = lookup.clientId;
        await touchClientConfirmed(trx, clientId);
        const client = await trx.selectFrom('clients').select('name').where('id', '=', clientId).executeTakeFirstOrThrow();
        displayName = client.name;
      } else {
        // New-client intake — the fix for the gap in PRD-live-queue-checkin.md §5.4.
        if (!dto.newClientName) {
          throw new BadRequestException({
            code: 'NEW_CLIENT_NAME_REQUIRED',
            message: 'This phone number is not on file. Provide a name to create a client profile.',
          });
        }
        const client = await createClient(trx, {
          organizationId,
          name: dto.newClientName,
          phone: dto.phone,
          referralSource: dto.referralSource ?? null,
          allergyFlag: dto.allergyFlag ?? false,
        });
        clientId = client.id;
        displayName = client.name;
      }
    } else {
      if (!dto.guestName) throw new BadRequestException('guestName is required when mode is "guest"');
    }

    const maxOrder = await trx
      .selectFrom('queue_entries')
      .select(({ fn }) => [fn.max('waiting_order').as('max')])
      .where('location_id', '=', locationId)
      .where('status', '=', 'waiting')
      .executeTakeFirst();
    const nextOrder = (maxOrder?.max ?? -1) + 1;

    // Default present value: guest walk-ins default present; appointments
    // default not-present until check-in day-of; explicit dto.present wins
    // when the caller specifies it (algorithm spec §"New items", item 8).
    const present = dto.present ?? (!dto.isAppointment ? true : false);

    const entry = await trx
      .insertInto('queue_entries')
      .values({
        location_id: locationId,
        client_id: clientId,
        guest_name: clientId ? null : displayName,
        service_id: dto.serviceId,
        status: 'waiting',
        assigned_location_staff_id: dto.requestedStaffId ?? null,
        requested_specific_staff: !!dto.requestedStaffId,
        is_appt: dto.isAppointment,
        appt_at: dto.isAppointment ? new Date(dto.apptAt as string) : null,
        present,
        present_checked_at: present ? new Date() : null,
        waiting_order: nextOrder,
        original_waiting_order: nextOrder,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await appendEvent(trx, {
      locationId,
      eventType: 'client_checked_in',
      entityId: entry.id,
      actorUserId,
      payload: { queueEntryId: entry.id, clientId, displayName, mode: dto.mode, serviceId: dto.serviceId },
    });

    this.broadcast(locationId);
    return entry;
  }

  async start(locationId: string, queueEntryId: string, actorUserId: string, dto: StartDto) {
    const trx = db();

    const entry = await this.getEntryOrThrow(queueEntryId);
    if (entry.status !== 'waiting') {
      throw new ConflictException('Only a waiting entry can be started');
    }

    const staff = await trx
      .selectFrom('location_staff')
      .selectAll()
      .where('id', '=', dto.staffId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    if (!staff) throw new NotFoundException('Staff member not found at this location');

    const eligible = await this.eligibleStaffForEntry(locationId, entry);
    if (!eligible.some((e) => e.locationStaffId === dto.staffId)) {
      throw new ConflictException(
        entry.is_appt ? 'Selected staff member is not scheduled to work at this appointment time' : 'Selected staff member is not clocked in',
      );
    }

    await trx
      .updateTable('queue_entries')
      .set({
        status: 'in_service',
        assigned_location_staff_id: dto.staffId,
        service_notes: dto.serviceNotes ?? null,
        updated_at: new Date(),
      })
      .where('id', '=', queueEntryId)
      .execute();

    await trx.updateTable('location_staff').set({ status: 'busy' }).where('id', '=', dto.staffId).execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'service_started',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        staffId: dto.staffId,
        reversal: {
          previousStatus: entry.status,
          previousAssignedStaffId: entry.assigned_location_staff_id,
          previousServiceNotes: entry.service_notes,
        },
      },
    });

    this.broadcast(locationId);
    return this.getEntryOrThrow(queueEntryId);
  }

  /**
   * Called by the Payments module (queue.controller's /complete route
   * orchestrates: charge via PaymentsService, then this) once a charge has
   * succeeded or the manual/external path has been recorded. Frees the
   * assigned staff member and marks the entry completed; does NOT write
   * the transaction row itself — that's PaymentsService's job, kept
   * separate so this module doesn't need to know about Stripe/Square.
   */
  async finalizeCompletion(locationId: string, queueEntryId: string, actorUserId: string, transactionId: string) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (entry.status !== 'in_service') {
      throw new ConflictException('Only an in-service entry can be completed');
    }

    await trx
      .updateTable('queue_entries')
      .set({ status: 'completed', updated_at: new Date() })
      .where('id', '=', queueEntryId)
      .execute();

    if (entry.assigned_location_staff_id) {
      await trx
        .updateTable('location_staff')
        .set({ status: 'available' })
        .where('id', '=', entry.assigned_location_staff_id)
        .execute();
    }

    await appendEvent(trx, {
      locationId,
      eventType: 'service_completed',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        transactionId,
        reversal: { previousStatus: 'in_service', staffId: entry.assigned_location_staff_id },
      },
    });

    this.broadcast(locationId);
  }

  private async terminate(
    locationId: string,
    queueEntryId: string,
    actorUserId: string,
    status: 'cancelled' | 'no_show',
    eventType: QueueEventType,
    options: { abandoned?: boolean; allowInService?: boolean } = {},
  ) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);
    const allowedStatuses = options.allowInService ? ['waiting', 'in_service'] : ['waiting'];
    if (!allowedStatuses.includes(entry.status)) {
      throw new ConflictException(`Only a waiting${options.allowInService ? ' or in-service' : ''} entry can be marked ${status}`);
    }

    await trx
      .updateTable('queue_entries')
      .set({ status, abandoned: options.abandoned ?? false, updated_at: new Date() })
      .where('id', '=', queueEntryId)
      .execute();

    // Cancelling directly out of Now Serving (PRD-live-queue-checkin.md §5.2
    // "cancel service outright") must free the barber it was occupying.
    if (entry.status === 'in_service' && entry.assigned_location_staff_id) {
      await trx.updateTable('location_staff').set({ status: 'available' }).where('id', '=', entry.assigned_location_staff_id).execute();
    }

    await appendEvent(trx, {
      locationId,
      eventType,
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        reversal: {
          previousStatus: entry.status,
          previousWaitingOrder: entry.waiting_order,
          previousAssignedStaffId: entry.assigned_location_staff_id,
        },
      },
    });

    this.broadcast(locationId);
  }

  /** Never checked in / never showed up. */
  noShow(locationId: string, queueEntryId: string, actorUserId: string) {
    return this.terminate(locationId, queueEntryId, actorUserId, 'no_show', 'queue_entry_no_show');
  }

  /** Cancellable from either Waiting or Now Serving (PRD-live-queue-checkin.md §5.2 "cancel service outright"). */
  cancel(locationId: string, queueEntryId: string, actorUserId: string) {
    return this.terminate(locationId, queueEntryId, actorUserId, 'cancelled', 'queue_entry_cancelled', { allowInService: true });
  }

  /** Checked "here" (present=true) but never got served — tracked distinctly from no-show, per confirmed decision. */
  async abandon(locationId: string, queueEntryId: string, actorUserId: string) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (!entry.present) {
      throw new BadRequestException('Only a present entry can be marked abandoned — use no-show for a non-present entry');
    }
    return this.terminate(locationId, queueEntryId, actorUserId, 'cancelled', 'queue_entry_abandoned', { abandoned: true });
  }

  async reassign(locationId: string, queueEntryId: string, actorUserId: string, dto: ReassignDto) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);

    const staff = await trx
      .selectFrom('location_staff')
      .selectAll()
      .where('id', '=', dto.newStaffId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    if (!staff) throw new NotFoundException('Staff member not found at this location');

    const eligible = await this.eligibleStaffForEntry(locationId, entry);
    if (!eligible.some((e) => e.locationStaffId === dto.newStaffId)) {
      throw new ConflictException(
        entry.status === 'in_service'
          ? 'Selected staff member is not currently available'
          : entry.is_appt
            ? 'Selected staff member is not scheduled to work at this appointment time'
            : 'Selected staff member is not clocked in',
      );
    }

    await trx
      .updateTable('queue_entries')
      .set({ assigned_location_staff_id: dto.newStaffId, updated_at: new Date() })
      .where('id', '=', queueEntryId)
      .execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'queue_entry_reassigned',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        newStaffId: dto.newStaffId,
        reversal: { previousStaffId: entry.assigned_location_staff_id },
      },
    });

    this.broadcast(locationId);
  }

  /** Changing the service while still waiting — e.g. the client decided on a different cut at the desk. */
  async changeService(locationId: string, queueEntryId: string, actorUserId: string, dto: ChangeServiceDto) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (entry.status !== 'waiting') {
      throw new ConflictException('Only a waiting entry can have its service changed');
    }

    const service = await trx.selectFrom('services').selectAll().where('id', '=', dto.serviceId).where('location_id', '=', locationId).executeTakeFirst();
    if (!service) throw new NotFoundException('Service not found at this location');

    await trx.updateTable('queue_entries').set({ service_id: dto.serviceId, updated_at: new Date() }).where('id', '=', queueEntryId).execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'queue_entry_service_changed',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        newServiceId: dto.serviceId,
        reversal: { previousServiceId: entry.service_id },
      },
    });

    this.broadcast(locationId);
  }

  async reorder(locationId: string, actorUserId: string, dto: ReorderDto) {
    const trx = db();

    const before = await trx
      .selectFrom('queue_entries')
      .select(['id', 'waiting_order'])
      .where('location_id', '=', locationId)
      .where('status', '=', 'waiting')
      .execute();
    const beforeMap = new Map(before.map((b) => [b.id, b.waiting_order]));

    for (let i = 0; i < dto.orderedQueueEntryIds.length; i++) {
      await trx
        .updateTable('queue_entries')
        .set({ waiting_order: i, updated_at: new Date() })
        .where('id', '=', dto.orderedQueueEntryIds[i])
        .where('location_id', '=', locationId)
        .execute();
    }

    await appendEvent(trx, {
      locationId,
      eventType: 'queue_entry_reordered',
      entityId: null,
      actorUserId,
      payload: {
        newOrder: dto.orderedQueueEntryIds,
        reversal: { previousOrder: Array.from(beforeMap.entries()).map(([id, order]) => ({ id, order })) },
      },
    });

    this.broadcast(locationId);
  }

  async togglePresent(locationId: string, queueEntryId: string, actorUserId: string, dto: TogglePresentDto) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);

    // presentProjectedAt: this entry's current queue-position estimate at
    // the moment "here" was checked — raw data for a future wait-time
    // accuracy analysis, per the confirmed decision in HANDOFF-master.md.
    let projectedAt: Date | null = null;
    if (dto.present && entry.status === 'waiting') {
      const board = await this.getBoard(locationId);
      const mine = board.waiting.find((w) => w.id === queueEntryId);
      projectedAt = mine?.estimatedStart ?? null;
    }

    await trx
      .updateTable('queue_entries')
      .set({
        present: dto.present,
        present_checked_at: dto.present ? new Date() : entry.present_checked_at,
        present_projected_at: dto.present ? projectedAt : entry.present_projected_at,
        updated_at: new Date(),
      })
      .where('id', '=', queueEntryId)
      .execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'queue_entry_present_toggled',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        present: dto.present,
        reversal: {
          previousPresent: entry.present,
          previousCheckedAt: entry.present_checked_at,
          previousProjectedAt: entry.present_projected_at,
        },
      },
    });

    this.broadcast(locationId);
  }

  async returnToWaiting(locationId: string, queueEntryId: string, actorUserId: string, dto: ReturnToWaitingDto) {
    const trx = db();
    const entry = await this.getEntryOrThrow(queueEntryId);

    let waitingOrder: number;
    if (dto.position === 'top') {
      const min = await trx
        .selectFrom('queue_entries')
        .select(({ fn }) => [fn.min('waiting_order').as('min')])
        .where('location_id', '=', locationId)
        .where('status', '=', 'waiting')
        .executeTakeFirst();
      waitingOrder = (min?.min ?? 0) - 1;
    } else {
      waitingOrder = entry.original_waiting_order ?? 0;
    }

    if (entry.assigned_location_staff_id && entry.status === 'in_service') {
      await trx
        .updateTable('location_staff')
        .set({ status: 'available' })
        .where('id', '=', entry.assigned_location_staff_id)
        .execute();
    }

    await trx
      .updateTable('queue_entries')
      .set({
        status: 'waiting',
        // Re-enters the pool as "Any available" and gets re-evaluated fresh
        // — the original barber isn't guaranteed to still be free (wait-time
        // algorithm spec §7).
        assigned_location_staff_id: null,
        waiting_order: waitingOrder,
        updated_at: new Date(),
      })
      .where('id', '=', queueEntryId)
      .execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'queue_entry_returned_to_waiting',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        position: dto.position,
        reversal: {
          previousStatus: entry.status,
          previousAssignedStaffId: entry.assigned_location_staff_id,
          previousWaitingOrder: entry.waiting_order,
        },
      },
    });

    this.broadcast(locationId);
  }

  async clockIn(locationId: string, locationStaffId: string, actorUserId: string) {
    const trx = db();
    const staff = await trx
      .selectFrom('location_staff')
      .selectAll()
      .where('id', '=', locationStaffId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    if (!staff) throw new NotFoundException('Staff member not found at this location');

    await trx.updateTable('location_staff').set({ status: 'available' }).where('id', '=', locationStaffId).execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'staff_clocked_in',
      entityId: locationStaffId,
      actorUserId,
      payload: { locationStaffId, reversal: { previousStatus: staff.status } },
    });

    this.broadcast(locationId);
  }

  async setStaffStatus(locationId: string, locationStaffId: string, actorUserId: string, dto: SetStaffStatusDto) {
    const trx = db();
    const staff = await trx
      .selectFrom('location_staff')
      .selectAll()
      .where('id', '=', locationStaffId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    if (!staff) throw new NotFoundException('Staff member not found at this location');

    if ((dto.status === 'break' || dto.status === 'off') && staff.status === 'busy') {
      const activeEntry = await trx
        .selectFrom('queue_entries')
        .select(['id'])
        .where('assigned_location_staff_id', '=', locationStaffId)
        .where('status', '=', 'in_service')
        .executeTakeFirst();
      if (activeEntry) {
        throw new ConflictException({
          code: 'STAFF_HAS_ACTIVE_CLIENT',
          message: 'This staff member is currently serving a client. Complete or reassign that client before changing status.',
          queueEntryId: activeEntry.id,
        });
      }
    }

    await trx.updateTable('location_staff').set({ status: dto.status }).where('id', '=', locationStaffId).execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'staff_status_changed',
      entityId: locationStaffId,
      actorUserId,
      payload: { locationStaffId, newStatus: dto.status, reversal: { previousStatus: staff.status } },
    });

    this.broadcast(locationId);
  }

  async undo(locationId: string, eventId: string, actorUserId: string) {
    const trx = db();

    const event = await trx.selectFrom('events').selectAll().where('id', '=', eventId).where('location_id', '=', locationId).executeTakeFirst();
    if (!event) throw new NotFoundException('Event not found');
    if (event.event_type.endsWith('_undone')) {
      throw new BadRequestException('This event is already an undo action');
    }

    // Was this exact event id already targeted by an undo? Scanned in app
    // code rather than a jsonb query — this location's event volume is
    // small enough that it isn't worth a specialized index/query for it.
    const undoneAlready = await trx
      .selectFrom('events')
      .selectAll()
      .where('location_id', '=', locationId)
      .execute();
    const isUndone = undoneAlready.some((e) => (e.payload as any)?.undoneEventId === event.id);
    if (isUndone) {
      throw new BadRequestException('This action was already undone');
    }

    if (event.entity_id) {
      const laterEvent = await trx
        .selectFrom('events')
        .select(['id'])
        .where('location_id', '=', locationId)
        .where('entity_id', '=', event.entity_id)
        .where('id', '>', event.id)
        .executeTakeFirst();
      if (laterEvent) {
        throw new ConflictException('A later action on this entry makes this undo unsafe — reload and try the most recent action instead.');
      }
    }

    const payload = event.payload as any;
    const reversal = payload?.reversal;

    switch (event.event_type) {
      case 'client_checked_in': {
        await trx.updateTable('queue_entries').set({ status: 'cancelled', updated_at: new Date() }).where('id', '=', payload.queueEntryId).execute();
        break;
      }
      case 'service_started': {
        await trx
          .updateTable('queue_entries')
          .set({
            status: reversal.previousStatus,
            assigned_location_staff_id: reversal.previousAssignedStaffId,
            service_notes: reversal.previousServiceNotes,
            updated_at: new Date(),
          })
          .where('id', '=', payload.queueEntryId)
          .execute();
        await trx.updateTable('location_staff').set({ status: 'available' }).where('id', '=', payload.staffId).execute();
        break;
      }
      case 'service_completed': {
        await trx
          .updateTable('queue_entries')
          .set({ status: reversal.previousStatus, updated_at: new Date() })
          .where('id', '=', payload.queueEntryId)
          .execute();
        if (reversal.staffId) {
          await trx.updateTable('location_staff').set({ status: 'busy' }).where('id', '=', reversal.staffId).execute();
        }
        if (payload.transactionId) {
          const txn = await trx.selectFrom('transactions').selectAll().where('id', '=', payload.transactionId).executeTakeFirst();
          if (txn) {
            await trx.insertInto('refunds').values({ original_transaction_id: txn.id, amount: txn.total, reason: 'Undo of Complete action' }).execute();
          }
        }
        break;
      }
      case 'queue_entry_cancelled':
      case 'queue_entry_no_show':
      case 'queue_entry_abandoned': {
        // Cancel is reachable from Now Serving too (allowInService) — undo
        // must restore whichever status it actually came from, not always
        // 'waiting', and re-busy the staff member if it came from in_service.
        const restoredStatus = reversal.previousStatus ?? 'waiting';
        await trx
          .updateTable('queue_entries')
          .set({
            status: restoredStatus,
            abandoned: false,
            waiting_order: reversal.previousWaitingOrder,
            assigned_location_staff_id: reversal.previousAssignedStaffId ?? null,
            updated_at: new Date(),
          })
          .where('id', '=', payload.queueEntryId)
          .execute();
        if (restoredStatus === 'in_service' && reversal.previousAssignedStaffId) {
          await trx.updateTable('location_staff').set({ status: 'busy' }).where('id', '=', reversal.previousAssignedStaffId).execute();
        }
        break;
      }
      case 'queue_entry_reassigned': {
        await trx
          .updateTable('queue_entries')
          .set({ assigned_location_staff_id: reversal.previousStaffId, updated_at: new Date() })
          .where('id', '=', payload.queueEntryId)
          .execute();
        break;
      }
      case 'queue_entry_service_changed': {
        await trx
          .updateTable('queue_entries')
          .set({ service_id: reversal.previousServiceId, updated_at: new Date() })
          .where('id', '=', payload.queueEntryId)
          .execute();
        break;
      }
      case 'queue_entry_reordered': {
        for (const item of reversal.previousOrder as { id: string; order: number | null }[]) {
          await trx.updateTable('queue_entries').set({ waiting_order: item.order, updated_at: new Date() }).where('id', '=', item.id).execute();
        }
        break;
      }
      case 'queue_entry_present_toggled': {
        await trx
          .updateTable('queue_entries')
          .set({
            present: reversal.previousPresent,
            present_checked_at: reversal.previousCheckedAt,
            present_projected_at: reversal.previousProjectedAt,
            updated_at: new Date(),
          })
          .where('id', '=', payload.queueEntryId)
          .execute();
        break;
      }
      case 'queue_entry_returned_to_waiting': {
        await trx
          .updateTable('queue_entries')
          .set({
            status: reversal.previousStatus,
            assigned_location_staff_id: reversal.previousAssignedStaffId,
            waiting_order: reversal.previousWaitingOrder,
            updated_at: new Date(),
          })
          .where('id', '=', payload.queueEntryId)
          .execute();
        break;
      }
      case 'staff_status_changed':
      case 'staff_clocked_in': {
        await trx.updateTable('location_staff').set({ status: reversal.previousStatus }).where('id', '=', payload.locationStaffId).execute();
        break;
      }
      default:
        throw new BadRequestException(`Undo not supported for event type ${event.event_type}`);
    }

    await appendEvent(trx, {
      locationId,
      eventType: `${event.event_type}_undone` as QueueEventType,
      entityId: event.entity_id,
      actorUserId,
      payload: { undoneEventId: event.id },
    });

    this.broadcast(locationId);
  }

  /**
   * Events enriched with a human-readable `description` ("Checked in
   * Sam R. (walk-in)", "Kim set to available") built server-side, where
   * the names are one indexed lookup away — rather than making the
   * frontend re-derive them from raw payloads it doesn't have the joins
   * for.
   */
  async activityLog(locationId: string, limit = 50) {
    const trx = db();
    const events = await trx
      .selectFrom('events')
      .selectAll()
      .where('location_id', '=', locationId)
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    const entryIds = new Set<string>();
    const staffIds = new Set<string>();
    const serviceIds = new Set<string>();
    for (const e of events) {
      const p = e.payload as any;
      if (p?.queueEntryId) entryIds.add(p.queueEntryId);
      for (const key of ['staffId', 'newStaffId', 'locationStaffId']) {
        if (p?.[key]) staffIds.add(p[key]);
      }
      if (p?.newServiceId) serviceIds.add(p.newServiceId);
    }

    const entryNames = new Map<string, string>();
    if (entryIds.size > 0) {
      const rows = await trx
        .selectFrom('queue_entries as qe')
        .leftJoin('clients as c', 'c.id', 'qe.client_id')
        .select(['qe.id as id', 'c.name as clientName', 'qe.guest_name as guestName'])
        .where('qe.id', 'in', [...entryIds])
        .execute();
      for (const r of rows) entryNames.set(r.id, r.clientName ?? r.guestName ?? 'Guest');
    }

    const staffNames = new Map<string, string>();
    if (staffIds.size > 0) {
      const rows = await trx
        .selectFrom('location_staff as ls')
        .innerJoin('users as u', 'u.id', 'ls.user_id')
        .select(['ls.id as id', 'u.full_name as name'])
        .where('ls.id', 'in', [...staffIds])
        .execute();
      for (const r of rows) staffNames.set(r.id, r.name);
    }

    const serviceNames = new Map<string, string>();
    if (serviceIds.size > 0) {
      const rows = await trx.selectFrom('services').select(['id', 'name']).where('id', 'in', [...serviceIds]).execute();
      for (const r of rows) serviceNames.set(r.id, r.name);
    }

    const byId = new Map(events.map((e) => [String(e.id), e]));

    const describe = (e: (typeof events)[number]): string => {
      const p = e.payload as any;
      const who = (p?.queueEntryId && entryNames.get(p.queueEntryId)) ?? p?.displayName ?? 'Guest';
      const staff = (id?: string) => (id && staffNames.get(id)) || 'a barber';

      switch (e.event_type) {
        case 'client_checked_in':
          return `Checked in ${who}${p?.mode === 'guest' ? ' (walk-in)' : ''}`;
        case 'service_started':
          return `Started ${who} with ${staff(p?.staffId)}`;
        case 'service_completed':
          return `Completed ${who}`;
        case 'queue_entry_cancelled':
          return `Cancelled ${who}`;
        case 'queue_entry_no_show':
          return `Marked ${who} as a no-show`;
        case 'queue_entry_abandoned':
          return `Marked ${who} as abandoned`;
        case 'queue_entry_reassigned':
          return `Reassigned ${who} to ${staff(p?.newStaffId)}`;
        case 'queue_entry_service_changed':
          return `Changed ${who}'s service to ${(p?.newServiceId && serviceNames.get(p.newServiceId)) || 'a different service'}`;
        case 'queue_entry_reordered':
          return 'Reordered the waiting list';
        case 'queue_entry_present_toggled':
          return p?.present ? `Marked ${who} as here` : `Unmarked ${who} as here`;
        case 'queue_entry_returned_to_waiting':
          return `Returned ${who} to ${p?.position === 'top' ? 'the top of the waiting list' : 'their original position'}`;
        case 'staff_status_changed':
          return `${staff(p?.locationStaffId)} set to ${p?.newStatus}`;
        case 'staff_clocked_in':
          return `${staff(p?.locationStaffId)} clocked in`;
        case 'shop_closed': {
          const v = Number(p?.variance ?? 0);
          const varianceLabel = Math.abs(v) < 0.01 ? 'matched exactly' : v > 0 ? `$${v.toFixed(2)} over` : `$${Math.abs(v).toFixed(2)} short`;
          return `Closed up shop — drawer ${varianceLabel}, card sales $${Number(p?.cardSalesTotal ?? 0).toFixed(2)}`;
        }
        default: {
          if (e.event_type.endsWith('_undone')) {
            const target = p?.undoneEventId ? byId.get(String(p.undoneEventId)) : undefined;
            return target ? `Undid: ${describe(target)}` : 'Undid an action';
          }
          return e.event_type.replace(/_/g, ' ');
        }
      }
    };

    return events.map((e) => ({ ...e, description: describe(e) }));
  }

  private async getEntryOrThrow(queueEntryId: string) {
    const entry = await db().selectFrom('queue_entries').selectAll().where('id', '=', queueEntryId).executeTakeFirst();
    if (!entry) throw new NotFoundException('Queue entry not found');
    return entry;
  }

  /**
   * Who's pickable for Start/Reassign depends on the entry's state:
   *  - in_service (an "active" appointment) — only staff free right now.
   *  - waiting, walk-in — anyone clocked in today (available/busy/break, not off).
   *  - waiting, appointment — anyone scheduled to work at the appointment's time,
   *    regardless of whether they've clocked in yet (the appt may be hours out).
   */
  async eligibleStaff(locationId: string, queueEntryId: string) {
    const entry = await this.getEntryOrThrow(queueEntryId);
    return this.eligibleStaffForEntry(locationId, entry);
  }

  private async eligibleStaffForEntry(
    locationId: string,
    entry: { status: QueueEntryStatus; is_appt: boolean; appt_at: Date | null },
  ) {
    const trx = db();
    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.status as status'])
      .where('ls.location_id', '=', locationId)
      .orderBy('u.full_name')
      .execute();

    if (entry.status === 'in_service') {
      return roster.filter((r) => r.status === 'available');
    }

    if (entry.is_appt && entry.appt_at) {
      const apptAt = new Date(entry.appt_at);
      const dow = apptAt.getDay();
      const dateStr = apptAt.toISOString().slice(0, 10);
      const minutes = apptAt.getHours() * 60 + apptAt.getMinutes();
      const staffIds = roster.map((r) => r.locationStaffId);

      const [exceptions, weekly] = staffIds.length
        ? await Promise.all([
            trx.selectFrom('schedule_exceptions').selectAll().where('location_staff_id', 'in', staffIds).where('work_date', '=', dateStr).execute(),
            trx.selectFrom('staff_schedule_days').selectAll().where('location_staff_id', 'in', staffIds).where('day_of_week', '=', dow).execute(),
          ])
        : [[], []];

      const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      return roster.filter((r) => {
        const exception = exceptions.find((e) => e.location_staff_id === r.locationStaffId);
        if (exception) {
          if (!exception.is_working || !exception.start_time || !exception.end_time) return false;
          return minutes >= toMinutes(exception.start_time) && minutes < toMinutes(exception.end_time);
        }
        const shift = weekly.find((w) => w.location_staff_id === r.locationStaffId);
        if (!shift) return false;
        return minutes >= toMinutes(shift.start_time) && minutes < toMinutes(shift.end_time);
      });
    }

    // waiting, walk-in: anyone clocked in today.
    return roster.filter((r) => r.status !== 'off');
  }
}
