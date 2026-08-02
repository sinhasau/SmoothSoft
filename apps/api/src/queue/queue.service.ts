import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { appendEvent } from './event-log';
import { estimateWaitTimes } from './wait-time';
import { poolMediansByService, rollingServiceAverages } from './service-performance';
import { chooseBestMatch } from './best-match';
import { reorderForAppointmentSla } from './appointment-sla';
import { projectInProgressJob } from './overrun';
import { buildBarberTimelines } from './barber-timeline';
import { disambiguateWaitingNames } from './display-name';
import { exceedsClosingGrace } from './closing-guard';
import { localDayOfWeek, resolveTodayHours } from './store-hours';
import { dateInTimezone, dayOfWeekForDate, minutesOfDayInTimezone } from '../common/time';
import { resolveDefaultServiceIds } from './default-service';
import { initialServiceNotes } from './visit-notes';
import { disambiguateProfiles } from './profile-disambiguation';
import { normalizePhone } from '../common/phone';
import { createClient, findClientByPhone, findClientsByPhone, touchClientConfirmed } from '../clients/client-lookup';
import type {
  ChangeServiceDto,
  CheckInDto,
  ReassignDto,
  ReorderDto,
  ReturnToWaitingDto,
  SetLateArrivalDto,
  UpdateServiceNotesDto,
  SetStaffStatusDto,
  StartDto,
  TogglePresentDto,
  ToggleReadyDto,
} from './queue.types';
import type { QueueEventType, QueueEntryStatus } from '../db/kysely.types';
import { QueueGateway } from './queue.gateway';

@Injectable()
export class QueueService {
  constructor(private readonly gateway: QueueGateway) {}

  private async serviceIdsForEntry(queueEntryId: string) {
    const rows = await db()
      .selectFrom('queue_entry_services')
      .select('service_id')
      .where('queue_entry_id', '=', queueEntryId)
      .orderBy('sort_order')
      .execute();
    return rows.map((row) => row.service_id);
  }

  /** Public: also called by AppointmentsService when a reschedule changes services on a linked, not-yet-present queue entry. */
  async setServiceLines(locationId: string, queueEntryId: string, serviceIds: string[]) {
    const uniqueIds = [...new Set(serviceIds)];
    await db().deleteFrom('queue_entry_services').where('queue_entry_id', '=', queueEntryId).execute();
    if (uniqueIds.length) {
      await db().insertInto('queue_entry_services').values(
        uniqueIds.map((serviceId, sortOrder) => ({
          location_id: locationId,
          queue_entry_id: queueEntryId,
          service_id: serviceId,
          sort_order: sortOrder,
        })),
      ).execute();
    }
  }

  private async replacePrimaryService(locationId: string, queueEntryId: string, serviceId: string) {
    const current = await this.serviceIdsForEntry(queueEntryId);
    await this.setServiceLines(locationId, queueEntryId, [serviceId, ...current.slice(1).filter((id) => id !== serviceId)]);
  }

  private broadcast(locationId: string) {
    // Fire and forget from the caller's perspective — the board is cheap to
    // recompute and every mutating action ends with this, so connected
    // clients invalidate their query cache instead of polling.
    void this.gateway.broadcastQueueChanged(locationId);
  }

  async getBoard(locationId: string) {
    const trx = db();
    const location = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();

    const team = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.status as status', 'ls.role as role'])
      .where('ls.location_id', '=', locationId)
      .orderBy('u.full_name')
      .execute();

    const backlogRows = await trx
      .selectFrom('queue_entries as qe')
      .leftJoin('services as s', 's.id', 'qe.service_id')
      .select(['s.duration_minutes as durationMinutes'])
      .where('qe.location_id', '=', locationId)
      .where('qe.status', '=', 'waiting')
      .execute();
    await this.autoMaterializeDueAppointments(locationId, backlogRows.map((row) => row.durationMinutes ?? 20));

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
        'c.notes as clientGeneralNotes',
        'qe.guest_name as guestName',
        'qe.service_id as serviceId',
        's.name as serviceName',
        's.duration_minutes as serviceDurationMinutes',
        'qe.assigned_location_staff_id as assignedStaffId',
        'u.full_name as assignedStaffName',
        'qe.requested_specific_staff as requestedSpecificStaff',
        'qe.requested_location_staff_id as requestedStaffId',
        'qe.is_appt as isAppt',
        'qe.appt_at as apptAt',
        'qe.present as present',
        'qe.present_checked_at as presentCheckedAt',
        'qe.ready_override as readyOverride',
        'qe.late_arrival as lateArrival',
        'qe.waiting_order as waitingOrder',
        'qe.service_notes as serviceNotes',
        'qe.identity_note as identityNote',
        'qe.service_started_at as serviceStartedAt',
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

    const activeIds = [...nowServing, ...waiting].map((entry) => entry.id);
    const serviceLines = activeIds.length
      ? await trx
        .selectFrom('queue_entry_services as qes')
        .innerJoin('services as service', 'service.id', 'qes.service_id')
        .select([
          'qes.queue_entry_id as queueEntryId',
          'service.id as id',
          'service.name as name',
          'service.duration_minutes as durationMinutes',
          'service.price as price',
          'qes.sort_order as sortOrder',
        ])
        .where('qes.queue_entry_id', 'in', activeIds)
        .orderBy('qes.sort_order')
        .execute()
      : [];
    const servicesByEntry = new Map<string, typeof serviceLines>();
    for (const line of serviceLines) {
      const lines = servicesByEntry.get(line.queueEntryId) ?? [];
      lines.push(line);
      servicesByEntry.set(line.queueEntryId, lines);
    }
    const withServices = <T extends (typeof waiting)[number]>(entry: T) => {
      const lines = servicesByEntry.get(entry.id) ?? (entry.serviceId ? [{
        queueEntryId: entry.id,
        id: entry.serviceId,
        name: entry.serviceName ?? 'Service',
        durationMinutes: entry.serviceDurationMinutes ?? 20,
        price: '0',
        sortOrder: 0,
      }] : []);
      return {
        ...entry,
        serviceId: lines[0]?.id ?? entry.serviceId,
        serviceIds: lines.map((line) => line.id),
        serviceName: lines.map((line) => line.name).join(' + '),
        serviceDurationMinutes: lines.reduce((sum, line) => sum + line.durationMinutes, 0),
        services: lines.map(({ id, name, durationMinutes, price }) => ({ id, name, durationMinutes, price })),
      };
    };
    const waitingWithServices = waiting.map(withServices);
    const nowServingWithServices = nowServing.map(withServices);

    const queueConfig = await trx.selectFrom('queue_config').select(['client_continuity_weight', 'appointment_max_wait_minutes']).where('location_id', '=', locationId).executeTakeFirst();
    const continuityWeight = queueConfig?.client_continuity_weight ?? 60;
    const appointmentMaxWaitMinutes = queueConfig?.appointment_max_wait_minutes ?? 10;
    const availableStaff = team.filter((member) => member.status === 'available' && member.role !== 'front_desk');
    const clientIds = [...new Set(waitingWithServices.map((entry) => entry.clientId).filter((id): id is string => Boolean(id)))];
    const historyRows = clientIds.length
      ? await trx.selectFrom('transactions').select(['client_id as clientId', 'location_staff_id as staffId']).where('location_id', '=', locationId).where('client_id', 'in', clientIds).where('location_staff_id', 'is not', null).orderBy('created_at', 'desc').limit(5000).execute()
      : [];
    const historyCounts = new Map<string, number>();
    for (const row of historyRows) {
      if (!row.clientId || !row.staffId) continue;
      const key = `${row.clientId}:${row.staffId}`;
      historyCounts.set(key, (historyCounts.get(key) ?? 0) + 1);
    }

    // Completed history feeds two medians: how fast each barber does each
    // service, and how much longer or shorter each client's visits run than
    // predicted. The service's catalog duration comes along so implausible
    // readings can be bounded relative to it — see service-performance.ts.
    const completedTimings = await trx.selectFrom('queue_entries as qe')
      .leftJoin('services as s', 's.id', 'qe.service_id')
      .select([
        'qe.assigned_location_staff_id as staffId', 'qe.service_id as serviceId', 'qe.client_id as clientId',
        'qe.service_started_at as serviceStartedAt', 'qe.service_completed_at as serviceCompletedAt',
        's.duration_minutes as catalogMinutes',
      ])
      .where('qe.location_id', '=', locationId).where('qe.status', '=', 'completed')
      .where('qe.assigned_location_staff_id', 'is not', null).where('qe.service_id', 'is not', null)
      .where('qe.service_started_at', 'is not', null).where('qe.service_completed_at', 'is not', null)
      .orderBy('qe.service_completed_at', 'desc').limit(1000).execute();
    const performance = rollingServiceAverages(completedTimings.map((row) => ({ staffId: row.staffId!, serviceId: row.serviceId!, serviceStartedAt: row.serviceStartedAt!, serviceCompletedAt: row.serviceCompletedAt!, catalogMinutes: row.catalogMinutes })));
    const performanceByPair = new Map(performance.filter((item) => item.sampleCount >= 3).map((item) => [`${item.staffId}:${item.serviceId}`, item]));

    // "Next available" is this shop's primary path, so most entries reach the
    // estimate with no barber attached at all. The pool median — the median of
    // the on-floor barbers' own medians — stands in for "the barber's average"
    // in exactly those cases, instead of dropping to a static catalog number.
    const onFloorStaffIds = new Set(team.filter((member) => member.status !== 'off' && member.role !== 'front_desk').map((member) => member.locationStaffId));
    const poolMedians = poolMediansByService(performance.filter((item) => item.sampleCount >= 3), onFloorStaffIds);

    /**
     * The one definition of "expected minutes": this barber's own median where
     * we know who it will be, otherwise the pool median for the floor, and
     * only then the static catalog duration.
     */
    const expectedMinutesFor = (staffId: string | null | undefined, serviceId: string, catalogMinutes: number | null | undefined) =>
      (staffId ? performanceByPair.get(`${staffId}:${serviceId}`)?.averageMinutes : undefined)
        ?? poolMedians.get(serviceId)
        ?? catalogMinutes
        ?? 20;

    const durationByEntry = new Map(waitingWithServices.map((w) => [w.id, Math.round(w.services.reduce((total, service) => total + (
      expectedMinutesFor(w.assignedStaffId ?? w.requestedStaffId, service.id, service.durationMinutes)
    ), 0)) || 20]));

    // Appointment SLA soft-bump — see appointment-sla.ts. Only reorders the
    // estimate math and which entries get first pick of an available staff
    // match below; the stored, drag-orderable waiting_order is untouched.
    // A late arrival keeps its place on the board but is held out of every
    // estimate: it does not push anyone else's start time back, and it gets no
    // estimate of its own, because nobody can promise one for a client staff
    // will slot in opportunistically. Everything else about the entry — start,
    // reassign, cancel, no-show — is unchanged.
    const estimateParticipants = waitingWithServices.filter((w) => !w.lateArrival);

    const sla = reorderForAppointmentSla(
      estimateParticipants.map((w) => ({
        queueEntryId: w.id,
        serviceDurationMinutes: durationByEntry.get(w.id) ?? 20,
        present: w.present,
        apptAt: w.isAppt && w.apptAt ? new Date(w.apptAt) : null,
      })),
      appointmentMaxWaitMinutes,
    );
    const priorityIndex = new Map(sla.order.map((id, index) => [id, index]));
    // Late arrivals are excluded rather than sorted: absent from priorityIndex
    // they would fall back to 0 and jump the whole queue for staff
    // recommendations, which is the opposite of what the flag means.
    const byPriority = [...estimateParticipants].sort((a, b) => (priorityIndex.get(a.id) ?? 0) - (priorityIndex.get(b.id) ?? 0));

    const reservedRecommendations = new Set<string>();
    const recommendationByEntry = new Map<string, { staffId: string; staffName: string; reason: string; clientVisitCount: number }>();
    for (const entry of byPriority) {
      if (!entry.present || entry.readyOverride === false) continue;
      const eligible = availableStaff.filter((member) => !reservedRecommendations.has(member.locationStaffId));
      const match = chooseBestMatch(
        eligible.map((member) => ({ staffId: member.locationStaffId, clientVisitCount: entry.clientId ? (historyCounts.get(`${entry.clientId}:${member.locationStaffId}`) ?? 0) : 0 })),
        continuityWeight,
        entry.requestedSpecificStaff ? entry.requestedStaffId : null,
      );
      if (!match) continue;
      const staff = availableStaff.find((member) => member.locationStaffId === match.staffId)!;
      reservedRecommendations.add(match.staffId);
      recommendationByEntry.set(entry.id, { staffId: match.staffId, staffName: staff.fullName, reason: match.reason, clientVisitCount: match.clientVisitCount });
    }

    const estimates = estimateWaitTimes(sla.order.map((id) => ({ queueEntryId: id, serviceDurationMinutes: durationByEntry.get(id) ?? 20 })));
    const estimateByEntry = new Map(estimates.map((e) => [e.queueEntryId, e.estimatedStart]));

    // Per-barber day projection ("Outlook"). Staffing follows live clock
    // state, not the published roster — see barber-timeline.ts. Every
    // in-progress job gets the proportional overrun adjustment first, so a
    // chair that's running late pushes that barber's whole remaining day by
    // exactly how late it actually is (see overrun.ts).
    const now = new Date();
    const predictedFor = (entry: (typeof nowServingWithServices)[number]) =>
      entry.services.reduce((total, service) => total + (
        expectedMinutesFor(entry.assignedStaffId ?? entry.requestedStaffId, service.id, service.durationMinutes)
      ), 0) || 20;
    const inProgressProjections = nowServingWithServices
      .filter((entry) => entry.assignedStaffId && entry.serviceStartedAt)
      .map((entry) => projectInProgressJob({
        queueEntryId: entry.id,
        staffId: entry.assignedStaffId!,
        startedAt: new Date(entry.serviceStartedAt!),
        predictedDurationMinutes: predictedFor(entry),
      }, now));
    const projectionByEntry = new Map(inProgressProjections.map((projection) => [projection.queueEntryId, projection]));
    const boardLabel = (entry: { clientName: string | null; guestName: string | null }) => entry.clientName ?? entry.guestName ?? 'Guest';
    const timelineResult = buildBarberTimelines(
      team.filter((member) => member.role !== 'front_desk').map((member) => ({
        staffId: member.locationStaffId,
        fullName: member.fullName,
        status: member.status as 'available' | 'busy' | 'break' | 'off',
      })),
      [
        ...nowServingWithServices.map((entry) => ({
          queueEntryId: entry.id,
          label: boardLabel(entry),
          durationMinutes: predictedFor(entry),
          inServiceWithStaffId: entry.assignedStaffId,
          projectedEnd: projectionByEntry.get(entry.id)?.projectedEnd ?? null,
        })),
        ...sla.order.map((id) => {
          const entry = waitingWithServices.find((w) => w.id === id)!;
          return {
            queueEntryId: id,
            label: boardLabel(entry),
            durationMinutes: durationByEntry.get(id) ?? 20,
            requestedStaffId: entry.requestedSpecificStaff ? entry.requestedStaffId : null,
            apptAt: entry.isAppt && entry.apptAt ? new Date(entry.apptAt) : null,
          };
        }),
      ],
      now,
    );

    // Last visit's service notes, per client on the board — shown beside (not
    // merged into) today's notes so a barber can see what the previous barber
    // recorded without the two becoming one blob. Scoped to entries currently
    // on the board rather than fetched per card.
    const boardClientIds = [...new Set([...waitingWithServices, ...nowServingWithServices].map((e) => e.clientId).filter((id): id is string => !!id))];
    const previousVisits = boardClientIds.length
      ? await trx.selectFrom('queue_entries')
        .select(['client_id as clientId', 'service_notes as serviceNotes', 'service_completed_at as completedAt'])
        .where('client_id', 'in', boardClientIds)
        .where('status', '=', 'completed')
        .where('service_notes', 'is not', null)
        .orderBy('service_completed_at', 'desc')
        .execute()
      : [];
    const lastVisitNotesByClient = new Map<string, string>();
    for (const row of previousVisits) {
      if (row.clientId && row.serviceNotes && !lastVisitNotesByClient.has(row.clientId)) {
        lastVisitNotesByClient.set(row.clientId, row.serviceNotes);
      }
    }
    const lastVisitNotesFor = (clientId: string | null | undefined) => (clientId ? lastVisitNotesByClient.get(clientId) ?? null : null);

    return {
      timezone: location.timezone,
      team,
      staffTimelines: timelineResult.timelines,
      timelineUnassigned: timelineResult.unassigned,
      overrunByEntry: Object.fromEntries(inProgressProjections.map((p) => [p.queueEntryId, Math.round(p.overrunMinutes)])),
      nowServing: nowServingWithServices.map((entry) => ({ ...entry, lastVisitNotes: lastVisitNotesFor(entry.clientId) })),
      priorityOrder: sla.order,
      waiting: waitingWithServices.map((w) => {
        const predictions = w.services.map((service) => performanceByPair.get(`${w.assignedStaffId ?? w.requestedStaffId}:${service.id}`));
        const predictedDurationMinutes = Math.round(
          w.services.reduce((total, service) => total + expectedMinutesFor(w.assignedStaffId ?? w.requestedStaffId, service.id, service.durationMinutes), 0),
        ) || 20;
        const historical = predictions.filter((prediction) => !!prediction);
        const recommendation = recommendationByEntry.get(w.id);
        return {
          ...w,
          estimatedStart: estimateByEntry.get(w.id) ?? null,
          predictedDurationMinutes,
          predictionSource: historical.length ? 'employee_history' as const : 'service_default' as const,
          predictionSampleCount: historical.length ? Math.min(...historical.map((prediction) => prediction!.sampleCount)) : 0,
          recommendedStaffId: recommendation?.staffId ?? null,
          recommendedStaffName: recommendation?.staffName ?? null,
          matchReason: recommendation?.reason ?? null,
          continuityVisitCount: recommendation?.clientVisitCount ?? 0,
          lastVisitNotes: lastVisitNotesFor(w.clientId),
          apptSlaProtected: sla.protected.has(w.id),
          apptSlaDeadline: w.isAppt && w.apptAt ? new Date(new Date(w.apptAt).getTime() + appointmentMaxWaitMinutes * 60_000) : null,
        };
      }),
    };
  }

  async checkIn(locationId: string, organizationId: string, actorUserId: string | null, dto: CheckInDto) {
    if (dto.isAppointment && !dto.apptAt) {
      throw new BadRequestException('apptAt is required for an appointment check-in');
    }

    const trx = db();

    const serviceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : [dto.serviceId])];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const validServices = await trx.selectFrom('services').select('id').where('location_id', '=', locationId).where('id', 'in', serviceIds).execute();
    if (validServices.length !== serviceIds.length) throw new BadRequestException('One or more selected services are unavailable at this location');

    if (!dto.isAppointment && dto.requestedStaffId) {
      const requested = await trx.selectFrom('location_staff').select(['id', 'status']).where('id', '=', dto.requestedStaffId).where('location_id', '=', locationId).executeTakeFirst();
      if (!requested || requested.status === 'off') throw new ConflictException('That staff member is not currently clocked in. Choose someone on shift or No preference.');
    }

    let clientId: string | null = null;
    let displayName = dto.guestName ?? null;

    if (dto.mode === 'phone' && dto.clientId) {
      // Caller already knows exactly which profile — e.g. the public
      // multi-person "who's checking in" picker, where a plain phone lookup
      // would be ambiguous whenever more than one person shares the number.
      // Skip the lookup/staleness/create path entirely.
      const known = await trx.selectFrom('clients').select(['id', 'name']).where('id', '=', dto.clientId).where('organization_id', '=', organizationId).executeTakeFirst();
      if (!known) throw new BadRequestException('Selected client was not found');
      clientId = known.id;
      displayName = known.name;
      await touchClientConfirmed(trx, clientId);
    } else if (dto.mode === 'phone') {
      // A contact record with no way to reach the person is not a contact — it
      // is an unidentifiable row that pollutes the directory and makes every
      // future phone lookup ambiguous (two "Mike Smith"s with no number cannot
      // be told apart by any later check-in). Anyone without a number belongs
      // on the Floor as a guest, which creates a queue entry and nothing else.
      const phone = dto.phone ?? '';
      if (!normalizePhone(phone)) {
        throw new BadRequestException({
          code: 'PHONE_REQUIRED_FOR_CLIENT',
          message: 'A phone number is required to save a client profile. Check this person in as a Guest instead.',
        });
      }

      // forceNewClient: the caller (the public multi-person picker) already
      // resolved every existing profile on this phone via findClientsByPhone
      // and knows this one isn't among them — skip the single-row phone
      // lookup entirely so a new sibling on a shared line (e.g. "Riley" added
      // alongside "Casey"/"Morgan") doesn't get silently merged into whichever
      // existing client that lookup happens to return first.
      const lookup = dto.forceNewClient
        ? { clientId: null, isNewClient: true, isStale: false, staleLastConfirmedAt: null }
        : await findClientByPhone(trx, organizationId, phone);

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
          phone,
          referralSource: dto.referralSource ?? null,
          allergyFlag: dto.allergyFlag ?? false,
        });
        clientId = client.id;
        displayName = client.name;
      }
    } else {
      if (!dto.guestName) throw new BadRequestException('guestName is required when mode is "guest"');
    }

    // One live spot per client. A double-tapped Join, a resubmitted form, or a
    // retry after a partial multi-person failure would otherwise put the same
    // person in line twice. Returning the existing entry rather than throwing
    // matches ensureQueueEntryForAppointment's idempotency and keeps a retry
    // harmless — the caller gets the spot they already hold.
    //
    // Guests are exempt: they have no client_id, and two walk-ins genuinely
    // named "Mike Smith" are two different people (identity_note and
    // disambiguateWaitingNames are what tell them apart on the Floor).
    if (clientId && !dto.isAppointment) {
      const live = await trx
        .selectFrom('queue_entries')
        .select('id')
        .where('location_id', '=', locationId)
        .where('client_id', '=', clientId)
        .where('status', 'in', ['waiting', 'in_service'])
        .executeTakeFirst();
      if (live) return this.getEntryOrThrow(live.id);
    }

    const maxOrder = await trx
      .selectFrom('queue_entries')
      .select(({ fn }) => [fn.max('waiting_order').as('max')])
      .where('location_id', '=', locationId)
      .where('status', '=', 'waiting')
      .executeTakeFirst();
    const nextOrder = (maxOrder?.max ?? -1) + 1;

    // A returning client picks up where the last visit left off: their previous
    // service notes are COPIED onto this entry so the barber can edit them for
    // today without rewriting what the last barber recorded. Anything typed at
    // check-in wins — see visit-notes.ts.
    const carriedNotes = clientId
      ? (await trx.selectFrom('queue_entries')
          .select('service_notes')
          .where('client_id', '=', clientId)
          .where('status', '=', 'completed')
          .where('service_notes', 'is not', null)
          .orderBy('service_completed_at', 'desc')
          .executeTakeFirst())?.service_notes ?? null
      : null;

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
        service_id: serviceIds[0],
        status: 'waiting',
        assigned_location_staff_id: dto.requestedStaffId ?? null,
        requested_specific_staff: !!dto.requestedStaffId,
        requested_location_staff_id: dto.requestedStaffId ?? null,
        is_appt: dto.isAppointment,
        appt_at: dto.isAppointment ? new Date(dto.apptAt as string) : null,
        present,
        present_checked_at: present ? new Date() : null,
        waiting_order: nextOrder,
        original_waiting_order: nextOrder,
        service_notes: initialServiceNotes({ providedNotes: dto.serviceNotes, lastVisitNotes: carriedNotes }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.setServiceLines(locationId, entry.id, serviceIds);

    const currentBoard = await this.getBoard(locationId);
    const estimatedStart = currentBoard.waiting.find((item) => item.id === entry.id)?.estimatedStart ?? null;
    if (estimatedStart) await trx.updateTable('queue_entries').set({ estimated_start_at: estimatedStart }).where('id', '=', entry.id).execute();

    await appendEvent(trx, {
      locationId,
      eventType: 'client_checked_in',
      entityId: entry.id,
      actorUserId,
      payload: { queueEntryId: entry.id, clientId, displayName, mode: dto.mode, serviceId: serviceIds[0], serviceIds },
    });

    this.broadcast(locationId);
    return entry;
  }

  /**
   * Today's hours for this location — special-hours override, else the weekly
   * store_hours row — resolved in the *location's* timezone, the same way
   * BookingService.slots() does it. See store-hours.ts for what the previous
   * server-clock version got wrong and why it turned customers away during
   * real opening hours.
   */
  private async closingTimeForToday(locationId: string): Promise<{ closed: boolean; openAt: Date | null; closeAt: Date | null }> {
    const trx = db();
    const now = new Date();
    const { timezone } = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
    const localDate = dateInTimezone(timezone, now);
    const [special, weekly] = await Promise.all([
      trx.selectFrom('location_special_hours').selectAll().where('location_id', '=', locationId).where('special_date', '=', localDate).executeTakeFirst(),
      trx.selectFrom('store_hours').selectAll().where('location_id', '=', locationId).where('day_of_week', '=', localDayOfWeek(timezone, now)).executeTakeFirst(),
    ]);
    const hours = resolveTodayHours(timezone, special, weekly, now);
    return { closed: hours.closed, openAt: hours.openAt, closeAt: hours.closeAt };
  }

  /** Public, aggregate-only wait snapshot — an anonymous visitor sees the current line and rough wait, not who's ahead beyond a privacy-safe label. */
  async publicSnapshot(locationId: string) {
    const board = await this.getBoard(locationId);
    const labels = disambiguateWaitingNames(board.waiting.map((entry) => ({ id: entry.id, clientName: entry.clientName, guestName: entry.guestName })));
    const backlogMinutes = board.waiting.reduce((sum, entry) => sum + (entry.predictedDurationMinutes ?? 20), 0);
    return {
      waitingCount: board.waiting.length,
      estimatedWaitMinutes: backlogMinutes,
      entries: board.waiting.map((entry) => ({ id: entry.id, label: labels.get(entry.id) ?? 'Guest', estimatedStart: entry.estimatedStart })),
    };
  }

  /** The confirmation/status screen's data source — reduced to just the caller's own entry, never another client's contact info. */
  async publicStatus(locationId: string, queueEntryId: string) {
    const entry = await db().selectFrom('queue_entries').selectAll().where('id', '=', queueEntryId).where('location_id', '=', locationId).executeTakeFirst();
    if (!entry) throw new NotFoundException('Queue entry not found');
    const service = await db().selectFrom('services').select('name').where('id', '=', entry.service_id ?? '').executeTakeFirst();
    if (entry.status !== 'waiting') {
      return { id: queueEntryId, status: entry.status, present: entry.present, serviceName: service?.name ?? null, staffName: null, position: null, aheadOfCount: null, estimatedStart: null };
    }
    const board = await this.getBoard(locationId);
    const order = board.priorityOrder ?? board.waiting.map((w) => w.id);
    const index = order.indexOf(queueEntryId);
    const mine = board.waiting.find((w) => w.id === queueEntryId);
    const staff = mine?.assignedStaffName ?? null;
    return {
      id: queueEntryId,
      status: entry.status,
      present: entry.present,
      serviceName: service?.name ?? mine?.serviceName ?? null,
      staffName: staff,
      position: index >= 0 ? index + 1 : null,
      aheadOfCount: index >= 0 ? index : null,
      estimatedStart: mine?.estimatedStart ?? null,
    };
  }

  /**
   * The public page's "pull up your profile" moment: suggests the client's
   * most recent completed service via their real queue_entries/queue_entry_services
   * history (not transaction_items — that table has no service_id FK, only a
   * free-text name that can drift from the current catalog). Falls back to a
   * service literally named "Haircut" at this location, then the catalog's
   * first service, matching BookingService.catalog()'s own shape.
   */
  /**
   * The public page's "pull up your profile" moment — returns EVERY client
   * on file for this phone number (a household sharing one line is the
   * common case, not an edge case; see findClientsByPhone), each with their
   * own last-completed-visit service suggestion, so the "who's checking in"
   * step can offer all of them rather than silently picking one.
   */
  async lastServiceForPhone(locationId: string, phone: string) {
    const trx = db();
    const location = await trx.selectFrom('locations').select('organization_id').where('id', '=', locationId).executeTakeFirstOrThrow();
    const people = await findClientsByPhone(trx, location.organization_id, phone);
    const catalog = await trx.selectFrom('services').select(['id', 'name', 'duration_minutes as durationMinutes', 'price', 'is_default as isDefault']).where('location_id', '=', locationId).orderBy('name').execute();
    const catalogIds = new Set(catalog.map((service) => service.id));

    const peopleWithSuggestions = await Promise.all(people.map(async (person) => {
      const lastCompleted = await trx.selectFrom('queue_entries').select('id').where('client_id', '=', person.id).where('location_id', '=', locationId).where('status', '=', 'completed').orderBy('service_completed_at', 'desc').limit(1).executeTakeFirst();
      let history: string[] = [];
      if (lastCompleted) {
        const lines = await trx.selectFrom('queue_entry_services').select('service_id').where('queue_entry_id', '=', lastCompleted.id).orderBy('sort_order').execute();
        history = lines.map((line) => line.service_id).filter((id) => catalogIds.has(id));
      }
      return { clientId: person.id, name: person.name, suggestedServiceIds: resolveDefaultServiceIds(catalog, history) };
    }));

    return { isNewClient: people.length === 0, people: peopleWithSuggestions, defaultServiceIds: resolveDefaultServiceIds(catalog, []) };
  }

  /**
   * Public "find my profile" for the self-service page: one field that accepts a name OR a phone
   * number. Same-name matches come back with a masked phone (last 4, escalating as needed) so the
   * customer can pick the right profile — the full number never leaves the server. Name matching is
   * a contained substring search, and the route is rate-limited, to blunt list enumeration.
   */
  async lookupProfiles(locationId: string, rawQuery: string) {
    const trx = db();
    const query = (rawQuery ?? '').trim();
    const location = await trx.selectFrom('locations').select('organization_id').where('id', '=', locationId).executeTakeFirstOrThrow();
    const catalog = await trx.selectFrom('services').select(['id', 'name', 'duration_minutes as durationMinutes', 'price', 'is_default as isDefault']).where('location_id', '=', locationId).orderBy('name').execute();
    const catalogIds = new Set(catalog.map((service) => service.id));
    const defaultServiceIds = resolveDefaultServiceIds(catalog, []);

    const digits = normalizePhone(query);
    const inputWasPhone = digits.length >= 7;
    if (query.length < 2) {
      return { isNewClient: true, people: [], defaultServiceIds, inputWasPhone, digits };
    }

    const candidates = inputWasPhone
      ? await trx.selectFrom('clients').select(['id', 'name', 'phone_normalized as phone']).where('organization_id', '=', location.organization_id).where('phone_normalized', '=', digits).orderBy('name').execute()
      : await trx.selectFrom('clients').select(['id', 'name', 'phone_normalized as phone']).where('organization_id', '=', location.organization_id).where('name', 'ilike', `%${query}%`).orderBy('name').limit(10).execute();

    const withSuggestions = await Promise.all(candidates.map(async (person) => {
      const lastCompleted = await trx.selectFrom('queue_entries').select('id').where('client_id', '=', person.id).where('location_id', '=', locationId).where('status', '=', 'completed').orderBy('service_completed_at', 'desc').limit(1).executeTakeFirst();
      let history: string[] = [];
      if (lastCompleted) {
        const lines = await trx.selectFrom('queue_entry_services').select('service_id').where('queue_entry_id', '=', lastCompleted.id).orderBy('sort_order').execute();
        history = lines.map((line) => line.service_id).filter((id) => catalogIds.has(id));
      }
      return { clientId: person.id, name: person.name, phoneDigits: person.phone, suggestedServiceIds: resolveDefaultServiceIds(catalog, history) };
    }));

    return {
      isNewClient: candidates.length === 0,
      people: disambiguateProfiles(withSuggestions),
      defaultServiceIds,
      inputWasPhone,
      digits,
    };
  }

  /** Remote queue join from the public booking page — see docs/PRD-live-queue-checkin.md and the plan for this feature. */
  async publicJoin(locationId: string, dto: { phone: string; clientId?: string; name?: string; serviceId: string; serviceIds?: string[]; forceNewClient?: boolean }) {
    const trx = db();
    const location = await trx.selectFrom('locations').select('organization_id').where('id', '=', locationId).executeTakeFirstOrThrow();

    const serviceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : [dto.serviceId])];
    if (!serviceIds.length || serviceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const validServices = await trx.selectFrom('services').select(['id', 'duration_minutes']).where('location_id', '=', locationId).where('id', 'in', serviceIds).execute();
    if (validServices.length !== serviceIds.length) throw new BadRequestException('One or more selected services are unavailable at this location');
    const visitDurationMinutes = validServices.reduce((sum, service) => sum + service.duration_minutes, 0);

    const hours = await this.closingTimeForToday(locationId);
    const PAST_CLOSING_MESSAGE = "The wait right now would carry you past closing, and we'd rather not rush your visit. Come see us tomorrow — we'll have a chair ready.";
    if (hours.closed) {
      throw new ConflictException({ code: 'CLOSED_TODAY', title: "That's a wrap for today", message: PAST_CLOSING_MESSAGE });
    }
    const board = await this.getBoard(locationId);
    const backlogMinutes = board.waiting.reduce((sum, entry) => sum + (entry.predictedDurationMinutes ?? 20), 0);
    const estimatedFinish = new Date(Date.now() + (backlogMinutes + visitDurationMinutes) * 60_000);
    if (exceedsClosingGrace(estimatedFinish, hours.closeAt!, 30)) {
      throw new ConflictException({ code: 'PAST_CLOSING', title: "That's a wrap for today", message: PAST_CLOSING_MESSAGE });
    }

    const entry = await this.checkIn(locationId, location.organization_id, null, {
      mode: 'phone',
      phone: dto.phone,
      clientId: dto.clientId,
      newClientName: dto.name,
      forceNewClient: dto.forceNewClient,
      serviceId: serviceIds[0],
      serviceIds,
      isAppointment: false,
      present: false,
    });
    return this.publicStatus(locationId, entry.id);
  }

  /**
   * Idempotent: returns the id of the live (waiting/in_service) queue_entries
   * row already linked to this appointment, or creates one (present:false —
   * "on the Floor" but not yet physically arrived) if none exists yet. Used
   * both by the lazy auto-materialization pass in getBoard() and as a
   * fallback in checkInAppointment for a client arriving before that window
   * opens.
   */
  private async ensureQueueEntryForAppointment(locationId: string, appointment: { id: string; client_id: string; service_id: string; location_staff_id: string | null; starts_at: Date }): Promise<string> {
    const trx = db();
    const existing = await trx.selectFrom('queue_entries').select('id').where('location_id', '=', locationId).where('appointment_id', '=', appointment.id).where('status', 'in', ['waiting', 'in_service']).executeTakeFirst();
    if (existing) return existing.id;

    const serviceLines = await trx.selectFrom('appointment_services').select('service_id').where('appointment_id', '=', appointment.id).orderBy('sort_order').execute();
    const serviceIds = serviceLines.length ? serviceLines.map((line) => line.service_id) : [appointment.service_id];
    const maxOrder = await trx.selectFrom('queue_entries').select(({ fn }) => [fn.max('waiting_order').as('max')]).where('location_id', '=', locationId).where('status', '=', 'waiting').executeTakeFirst();
    const nextOrder = (maxOrder?.max ?? -1) + 1;
    const entry = await trx.insertInto('queue_entries').values({
      location_id: locationId,
      client_id: appointment.client_id,
      guest_name: null,
      service_id: serviceIds[0],
      status: 'waiting',
      assigned_location_staff_id: appointment.location_staff_id,
      requested_specific_staff: Boolean(appointment.location_staff_id),
      requested_location_staff_id: appointment.location_staff_id,
      is_appt: true,
      appt_at: appointment.starts_at,
      appointment_id: appointment.id,
      present: false,
      waiting_order: nextOrder,
      original_waiting_order: nextOrder,
    }).returningAll().executeTakeFirstOrThrow();
    await this.setServiceLines(locationId, entry.id, serviceIds);
    this.broadcast(locationId);
    return entry.id;
  }

  /**
   * Surfaces `appointments`-table bookings onto the Floor before they'd
   * otherwise be checked in: 2 hours ahead of time, or sooner if the current
   * backlog means a walk-in checking in right now wouldn't be seated until
   * at/after the appointment's own time. No cron exists in this app — this
   * runs lazily on every board fetch, which is frequent enough (20s poll +
   * every mutation broadcast) to be effectively real-time.
   */
  private async autoMaterializeDueAppointments(locationId: string, currentWaitingDurations: number[]) {
    const now = new Date();
    const backlogMinutes = currentWaitingDurations.reduce((sum, minutes) => sum + minutes, 0);
    const LOOKAHEAD_CAP_MINUTES = 4 * 60; // 2x the normal 2h window — a safety bound so an extreme backlog can pull someone in early without scanning the whole future.
    const candidates = await db()
      .selectFrom('appointments')
      .select(['id', 'client_id', 'service_id', 'location_staff_id', 'starts_at'])
      .where('location_id', '=', locationId)
      .where('status', 'in', ['booked', 'confirmed'])
      .where('starts_at', '<=', new Date(now.getTime() + LOOKAHEAD_CAP_MINUTES * 60_000))
      .orderBy('starts_at')
      .execute();

    for (const appointment of candidates) {
      const surfaceAt = Math.min(appointment.starts_at.getTime() - 2 * 60 * 60_000, appointment.starts_at.getTime() - backlogMinutes * 60_000);
      if (now.getTime() >= surfaceAt) {
        await this.ensureQueueEntryForAppointment(locationId, appointment);
      }
    }
  }

  async checkInAppointment(locationId: string, actorUserId: string, appointmentId: string) {
    const trx = db();
    const appointment = await trx.selectFrom('appointments').selectAll().where('id', '=', appointmentId).where('location_id', '=', locationId).executeTakeFirst();
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!['booked', 'confirmed'].includes(appointment.status)) throw new ConflictException(`This appointment is already ${appointment.status.replace('_', ' ')}.`);

    const queueEntryId = await this.ensureQueueEntryForAppointment(locationId, appointment);
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (!entry.present) await this.togglePresent(locationId, queueEntryId, actorUserId, { present: true });
    await trx.updateTable('appointments').set({ status: 'checked_in' }).where('id', '=', appointmentId).execute();
    await appendEvent(trx, { locationId, eventType: 'client_checked_in', entityId: queueEntryId, actorUserId, payload: { queueEntryId, appointmentId, mode: 'appointment' } });
    this.broadcast(locationId);
    return { queueEntryId };
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

    const previousServiceIds = await this.serviceIdsForEntry(queueEntryId);
    const nextServiceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : dto.serviceId ? [dto.serviceId] : previousServiceIds)];
    if (!nextServiceIds.length || nextServiceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const validServices = await trx.selectFrom('services').select('id').where('location_id', '=', locationId).where('id', 'in', nextServiceIds).execute();
    if (validServices.length !== nextServiceIds.length) throw new NotFoundException('One or more services are unavailable at this location');

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
        service_id: nextServiceIds[0],
        ready_override: null,
        service_started_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', queueEntryId)
      .execute();

    await this.setServiceLines(locationId, queueEntryId, nextServiceIds);

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
          previousServiceId: entry.service_id,
          previousServiceIds,
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
      .set({ status: 'completed', service_completed_at: new Date(), updated_at: new Date() })
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

  async waitAccuracy(locationId: string, days: number) {
    const safeDays = Math.max(1, Math.min(days, 365));
    const since = new Date();
    since.setDate(since.getDate() - safeDays);
    const rows = await db().selectFrom('queue_entries').select(['estimated_start_at', 'service_started_at']).where('location_id', '=', locationId).where('service_started_at', '>=', since).where('estimated_start_at', 'is not', null).execute();
    const errors = rows.map((row) => Math.abs((row.service_started_at!.getTime() - row.estimated_start_at!.getTime()) / 60000)).sort((a, b) => a - b);
    const median = errors.length ? errors[Math.floor(errors.length / 2)] : null;
    const withinTen = errors.length ? Math.round((errors.filter((value) => value <= 10).length / errors.length) * 100) : null;
    return { sampleSize: errors.length, medianAbsoluteErrorMinutes: median === null ? null : Math.round(median), withinTenMinutesPct: withinTen, windowDays: safeDays };
  }

  private async terminate(
    locationId: string,
    queueEntryId: string,
    actorUserId: string | null,
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
  cancel(locationId: string, queueEntryId: string, actorUserId: string | null) {
    return this.terminate(locationId, queueEntryId, actorUserId, 'cancelled', 'queue_entry_cancelled', { allowInService: true });
  }

  /**
   * Customer self-cancel from the public status link. Authorized purely by the
   * unguessable queue-entry UUID in the URL (same capability model as publicStatus),
   * and runs with a null actor exactly like publicJoin. Waiting-only: once a client
   * is seated we don't let the public link cancel a service already underway — that
   * returns changed:false rather than a hard error so the status page can just refresh.
   */
  async publicCancel(locationId: string, queueEntryId: string) {
    const entry = await db().selectFrom('queue_entries').select(['id', 'status']).where('id', '=', queueEntryId).where('location_id', '=', locationId).executeTakeFirst();
    if (!entry) throw new NotFoundException('Queue entry not found');
    if (entry.status !== 'waiting') return { changed: false, status: entry.status };
    await this.terminate(locationId, queueEntryId, null, 'cancelled', 'queue_entry_cancelled');
    return { changed: true, status: 'cancelled' };
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

    if (entry.status === 'in_service') {
      if (entry.assigned_location_staff_id) {
        await trx.updateTable('location_staff').set({ status: 'available' }).where('id', '=', entry.assigned_location_staff_id).execute();
      }
      await trx.updateTable('location_staff').set({ status: 'busy' }).where('id', '=', dto.newStaffId).execute();
    }

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

    const nextServiceIds = [...new Set(dto.serviceIds?.length ? dto.serviceIds : [dto.serviceId])];
    if (!nextServiceIds.length || nextServiceIds.length > 8) throw new BadRequestException('Choose between 1 and 8 services');
    const validServices = await trx.selectFrom('services').select('id').where('location_id', '=', locationId).where('id', 'in', nextServiceIds).execute();
    if (validServices.length !== nextServiceIds.length) throw new NotFoundException('One or more services are unavailable at this location');

    const previousServiceIds = await this.serviceIdsForEntry(queueEntryId);
    await trx.updateTable('queue_entries').set({ service_id: nextServiceIds[0], updated_at: new Date() }).where('id', '=', queueEntryId).execute();
    await this.setServiceLines(locationId, queueEntryId, nextServiceIds);

    await appendEvent(trx, {
      locationId,
      eventType: 'queue_entry_service_changed',
      entityId: queueEntryId,
      actorUserId,
      payload: {
        queueEntryId,
        newServiceId: nextServiceIds[0],
        newServiceIds: nextServiceIds,
        reversal: { previousServiceId: entry.service_id, previousServiceIds },
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
        ready_override: dto.present ? entry.ready_override : null,
        present_checked_at: dto.present ? new Date() : entry.present_checked_at,
        present_projected_at: dto.present ? projectedAt : entry.present_projected_at,
        identity_note: dto.identityNote !== undefined ? (dto.identityNote.trim() || null) : entry.identity_note,
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

  async toggleReady(locationId: string, queueEntryId: string, dto: ToggleReadyDto) {
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (entry.status !== 'waiting') throw new ConflictException('Only a waiting client can be moved to Ready to seat');
    await db().updateTable('queue_entries').set({
      ready_override: dto.ready,
      present: dto.ready ? true : entry.present,
      present_checked_at: dto.ready && !entry.present ? new Date() : entry.present_checked_at,
      updated_at: new Date(),
    }).where('id', '=', queueEntryId).where('location_id', '=', locationId).executeTakeFirstOrThrow();
    this.broadcast(locationId);
  }

  /**
   * Flags (or clears) a waiting client as a late arrival. They keep their place
   * on the board and every action stays available — this only removes them from
   * the wait-time estimate so they stop pushing everyone behind them back, and
   * gives up on quoting them a start time staff will choose opportunistically.
   */
  /**
   * Edits the notes for THIS visit only. Deliberately cannot reach
   * clients.notes: general notes are a standing record (allergies, standing
   * preferences) and must not be rewritten by whatever happened in one chair.
   */
  async updateServiceNotes(locationId: string, queueEntryId: string, dto: UpdateServiceNotesDto) {
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (!['waiting', 'in_service'].includes(entry.status)) {
      throw new ConflictException('Notes can only be edited while the client is waiting or in service');
    }
    await db().updateTable('queue_entries').set({
      service_notes: dto.serviceNotes.trim() || null,
      updated_at: new Date(),
    }).where('id', '=', queueEntryId).where('location_id', '=', locationId).executeTakeFirstOrThrow();
    this.broadcast(locationId);
  }

  async setLateArrival(locationId: string, queueEntryId: string, dto: SetLateArrivalDto) {
    const entry = await this.getEntryOrThrow(queueEntryId);
    if (entry.status !== 'waiting') throw new ConflictException('Only a waiting client can be marked a late arrival');
    await db().updateTable('queue_entries').set({
      late_arrival: dto.lateArrival,
      updated_at: new Date(),
    }).where('id', '=', queueEntryId).where('location_id', '=', locationId).executeTakeFirstOrThrow();
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
            service_id: reversal.previousServiceId,
            service_started_at: null,
            updated_at: new Date(),
          })
          .where('id', '=', payload.queueEntryId)
          .execute();
        if (reversal.previousServiceIds?.length) {
          await this.setServiceLines(locationId, payload.queueEntryId, reversal.previousServiceIds);
        }
        await trx.updateTable('location_staff').set({ status: 'available' }).where('id', '=', payload.staffId).execute();
        break;
      }
      case 'service_completed': {
        await trx
          .updateTable('queue_entries')
          .set({ status: reversal.previousStatus, service_completed_at: null, updated_at: new Date() })
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
        const current = await trx.selectFrom('queue_entries').select(['status', 'assigned_location_staff_id']).where('id', '=', payload.queueEntryId).executeTakeFirst();
        await trx
          .updateTable('queue_entries')
          .set({ assigned_location_staff_id: reversal.previousStaffId, updated_at: new Date() })
          .where('id', '=', payload.queueEntryId)
          .execute();
        if (current?.status === 'in_service') {
          if (current.assigned_location_staff_id) {
            await trx.updateTable('location_staff').set({ status: 'available' }).where('id', '=', current.assigned_location_staff_id).execute();
          }
          if (reversal.previousStaffId) {
            await trx.updateTable('location_staff').set({ status: 'busy' }).where('id', '=', reversal.previousStaffId).execute();
          }
        }
        break;
      }
      case 'queue_entry_service_changed': {
        await trx
          .updateTable('queue_entries')
          .set({ service_id: reversal.previousServiceId, updated_at: new Date() })
          .where('id', '=', payload.queueEntryId)
          .execute();
        if (reversal.previousServiceIds?.length) {
          await this.setServiceLines(locationId, payload.queueEntryId, reversal.previousServiceIds);
        }
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
        case 'shop_opened': {
          const v = Number(p?.variance ?? 0);
          const varianceLabel = Math.abs(v) < 0.01 ? 'matched the default' : v > 0 ? `$${v.toFixed(2)} above default` : `$${Math.abs(v).toFixed(2)} below default`;
          return `Opened store — drawer ${varianceLabel}`;
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
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.status as status', 'ls.role as role'])
      .where('ls.location_id', '=', locationId)
      .where('ls.role', '!=', 'front_desk')
      .orderBy('u.full_name')
      .execute();

    if (entry.status === 'in_service') {
      return roster.filter((r) => r.status === 'available');
    }

    if (entry.is_appt && entry.appt_at) {
      const apptAt = new Date(entry.appt_at);
      // Shift rows are keyed to the shop's local calendar day and wall clock, so
      // the date, weekday, and minute-of-day all have to be read in the
      // location's timezone — the same fix as closingTimeForToday above. Reading
      // them off the server clock shifted an evening appointment onto the next
      // day's shifts, hiding the barbers who are actually working it.
      const { timezone } = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
      const dateStr = dateInTimezone(timezone, apptAt);
      const dow = dayOfWeekForDate(dateStr);
      const minutes = minutesOfDayInTimezone(timezone, apptAt);
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

    // waiting, walk-in: clocked in AND not already mid-service with someone else.
    return roster.filter((r) => r.status === 'available');
  }
}
