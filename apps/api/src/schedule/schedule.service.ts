import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import type { DecideScheduleRequestDto, SubmitScheduleRequestDto } from './schedule.types';

const MIN_COVERAGE = 2;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Module 3's internal half (Scheduling) — the date-as-rows x barber-columns
 * grid from the reference screenshot. Per the confirmed decision in
 * HANDOFF-master.md: "Scheduling default: Date-specific coverage changes by
 * default; recurring changes require two explicit clicks and a warning" —
 * schedule_exceptions (one-off, date-specific) always takes precedence over
 * staff_schedule_days (the recurring weekly pattern) for a given date, and
 * only ever gets written to directly for a specific date. Changing the
 * recurring pattern itself goes through decideRequest()'s two-call confirm
 * flow.
 */
@Injectable()
export class ScheduleService {
  async grid(locationId: string, startDate: string, days: number) {
    const trx = db();

    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as staffId', 'u.full_name as fullName'])
      .where('ls.location_id', '=', locationId)
      .orderBy('u.full_name')
      .execute();

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const endKey = dateKey(end);

    const recurring = await trx
      .selectFrom('staff_schedule_days as ssd')
      .innerJoin('location_staff as ls', 'ls.id', 'ssd.location_staff_id')
      .select(['ssd.location_staff_id as staffId', 'ssd.day_of_week as dayOfWeek', 'ssd.start_time as startTime', 'ssd.end_time as endTime'])
      .where('ls.location_id', '=', locationId)
      .execute();
    const recurringMap = new Map<string, { startTime: string; endTime: string }>();
    for (const r of recurring) recurringMap.set(`${r.staffId}:${r.dayOfWeek}`, { startTime: r.startTime, endTime: r.endTime });

    const exceptions = await trx
      .selectFrom('schedule_exceptions')
      .selectAll()
      .where('location_id', '=', locationId)
      .where('work_date', '>=', startDate)
      .where('work_date', '<', endKey)
      .execute();
    const exceptionMap = new Map<string, (typeof exceptions)[number]>();
    for (const e of exceptions) exceptionMap.set(`${e.location_staff_id}:${e.work_date}`, e);

    const pendingRequests = await trx
      .selectFrom('schedule_change_requests')
      .selectAll()
      .where('location_id', '=', locationId)
      .where('status', '=', 'pending')
      .execute();
    const pendingOneTimeMap = new Map<string, (typeof pendingRequests)[number]>();
    for (const p of pendingRequests) {
      if (p.request_type === 'one_time' && p.work_date) {
        pendingOneTimeMap.set(`${p.location_staff_id}:${p.work_date}`, p);
      }
    }

    const rows = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      const dow = d.getDay();

      const entries = roster.map((person) => {
        const exception = exceptionMap.get(`${person.staffId}:${key}`);
        const pending = pendingOneTimeMap.get(`${person.staffId}:${key}`);
        let working: boolean;
        let startTime: string | null = null;
        let endTime: string | null = null;
        let source: 'exception' | 'recurring' | 'none' = 'none';

        if (exception) {
          working = exception.is_working;
          startTime = exception.start_time;
          endTime = exception.end_time;
          source = 'exception';
        } else {
          const rec = recurringMap.get(`${person.staffId}:${dow}`);
          working = !!rec;
          if (rec) {
            startTime = rec.startTime;
            endTime = rec.endTime;
            source = 'recurring';
          }
        }

        return {
          staffId: person.staffId,
          fullName: person.fullName,
          working,
          startTime,
          endTime,
          source,
          pendingRequest: pending ? { id: pending.id, isWorking: pending.is_working, reason: pending.reason } : null,
        };
      });

      const coverageCount = entries.filter((e) => e.working).length;

      rows.push({
        date: key,
        dayOfWeek: dow,
        entries,
        coverageCount,
        belowMinimum: coverageCount < MIN_COVERAGE,
      });
    }

    return { roster, rows, minimumCoverage: MIN_COVERAGE };
  }

  pendingRequests(locationId: string) {
    return db()
      .selectFrom('schedule_change_requests as r')
      .innerJoin('location_staff as ls', 'ls.id', 'r.location_staff_id')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select([
        'r.id as id',
        'r.location_staff_id as locationStaffId',
        'u.full_name as fullName',
        'r.request_type as requestType',
        'r.work_date as workDate',
        'r.day_of_week as dayOfWeek',
        'r.is_working as isWorking',
        'r.start_time as startTime',
        'r.end_time as endTime',
        'r.reason as reason',
        'r.created_at as createdAt',
      ])
      .where('r.location_id', '=', locationId)
      .where('r.status', '=', 'pending')
      .orderBy('r.created_at')
      .execute();
  }

  async submitRequest(locationId: string, requestedByUserId: string, dto: SubmitScheduleRequestDto) {
    if (dto.requestType === 'one_time' && !dto.workDate) {
      throw new BadRequestException('workDate is required for a one_time request');
    }
    if (dto.requestType === 'recurring' && dto.dayOfWeek === undefined) {
      throw new BadRequestException('dayOfWeek is required for a recurring request');
    }
    if (dto.isWorking && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException('startTime/endTime are required when isWorking is true');
    }

    return db()
      .insertInto('schedule_change_requests')
      .values({
        location_id: locationId,
        location_staff_id: dto.locationStaffId,
        request_type: dto.requestType,
        status: 'pending',
        work_date: dto.workDate ?? null,
        day_of_week: dto.dayOfWeek ?? null,
        is_working: dto.isWorking,
        start_time: dto.startTime ?? null,
        end_time: dto.endTime ?? null,
        reason: dto.reason ?? null,
        requested_by_user_id: requestedByUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async approveRequest(locationId: string, requestId: string, decidedByUserId: string, dto: DecideScheduleRequestDto) {
    const trx = db();
    const request = await trx
      .selectFrom('schedule_change_requests')
      .selectAll()
      .where('id', '=', requestId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'pending') throw new ConflictException('Request has already been decided');

    if (request.request_type === 'recurring' && !dto.confirmed) {
      throw new ConflictException({
        code: 'RECURRING_CHANGE_NEEDS_CONFIRMATION',
        message:
          'This changes the recurring weekly schedule going forward, not just one day. Confirm to apply it as a standing change.',
      });
    }

    if (request.request_type === 'one_time') {
      await trx
        .insertInto('schedule_exceptions')
        .values({
          location_staff_id: request.location_staff_id,
          location_id: locationId,
          work_date: request.work_date as string,
          is_working: request.is_working,
          start_time: request.start_time,
          end_time: request.end_time,
          reason: request.reason,
        })
        .onConflict((oc) =>
          oc.columns(['location_staff_id', 'work_date']).doUpdateSet({
            is_working: request.is_working,
            start_time: request.start_time,
            end_time: request.end_time,
            reason: request.reason,
          }),
        )
        .execute();
    } else {
      await trx
        .deleteFrom('staff_schedule_days')
        .where('location_staff_id', '=', request.location_staff_id)
        .where('day_of_week', '=', request.day_of_week as number)
        .execute();
      if (request.is_working) {
        await trx
          .insertInto('staff_schedule_days')
          .values({
            location_staff_id: request.location_staff_id,
            day_of_week: request.day_of_week as number,
            start_time: request.start_time as string,
            end_time: request.end_time as string,
          })
          .execute();
      }
    }

    return trx
      .updateTable('schedule_change_requests')
      .set({ status: 'approved', decided_by_user_id: decidedByUserId, decided_at: new Date() })
      .where('id', '=', requestId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async denyRequest(locationId: string, requestId: string, decidedByUserId: string) {
    const trx = db();
    const result = await trx
      .updateTable('schedule_change_requests')
      .set({ status: 'denied', decided_by_user_id: decidedByUserId, decided_at: new Date() })
      .where('id', '=', requestId)
      .where('location_id', '=', locationId)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Request not found or already decided');
    return result;
  }
}
