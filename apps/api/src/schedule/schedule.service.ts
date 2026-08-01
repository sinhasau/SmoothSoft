import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import type { DecideScheduleRequestDto, PublishScheduleDto, SubmitScheduleRequestDto } from './schedule.types';

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
  publication(locationId: string, weekStart: string) {
    return db().selectFrom('schedule_publications').selectAll().where('location_id', '=', locationId).where('week_start', '=', weekStart).where('status', '=', 'published').executeTakeFirst();
  }

  async publish(locationId: string, actorUserId: string, dto: PublishScheduleDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.weekStart)) throw new BadRequestException('weekStart must be YYYY-MM-DD');
    const trx = db();
    await trx.updateTable('schedule_publications').set({ status: 'superseded' }).where('location_id', '=', locationId).where('week_start', '=', dto.weekStart).where('status', '=', 'published').execute();
    return trx.insertInto('schedule_publications').values({ location_id: locationId, week_start: dto.weekStart, status: 'published', warning_count: dto.warningCount ?? 0, notify_scope: dto.notifyScope ?? 'all', published_by_user_id: actorUserId }).returningAll().executeTakeFirstOrThrow();
  }

  async grid(locationId: string, startDate: string, days: number, managerView = true) {
    const trx = db();
    const policy = await trx.selectFrom('location_scheduling_policy').select(['minimum_coverage', 'overtime_threshold_hours', 'chair_count', 'base_hourly_labor_cost', 'payroll_burden_pct']).where('location_id', '=', locationId).executeTakeFirst();
    const minimumCoverage = policy?.minimum_coverage ?? 2;
    const overtimeThresholdHours = Number(policy?.overtime_threshold_hours ?? 40);
    const chairCount = policy?.chair_count ?? 4;
    const baseHourlyLaborCost = Number(policy?.base_hourly_labor_cost ?? 24);
    const payrollBurdenPct = Number(policy?.payroll_burden_pct ?? 0);

    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as staffId', 'u.full_name as fullName', 'ls.role as role', 'ls.employment_status as employmentStatus'])
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

    const [storeHours, specialHours] = await Promise.all([
      trx.selectFrom('store_hours').selectAll().where('location_id', '=', locationId).execute(),
      trx.selectFrom('location_special_hours').selectAll().where('location_id', '=', locationId).where('special_date', '>=', startDate).where('special_date', '<', endKey).execute(),
    ]);
    const hoursByDay = new Map(storeHours.map((item) => [item.day_of_week, item]));
    const specialByDate = new Map(specialHours.map((item) => [item.special_date, item]));
    const isOpen = (date: string, dow: number) => {
      const special = specialByDate.get(date);
      return special ? !special.is_closed : hoursByDay.get(dow)?.is_open !== false;
    };

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
          pendingRequest: managerView && pending ? { id: pending.id, isWorking: pending.is_working, reason: pending.reason } : null,
        };
      });

      const activeServiceStaffIds = new Set(roster.filter((person) => person.employmentStatus === 'active' && person.role !== 'front_desk').map((person) => person.staffId));
      const coverageCount = entries.filter((e) => e.working && activeServiceStaffIds.has(e.staffId)).length;
      const chairEvents = entries.filter((entry) => entry.working && activeServiceStaffIds.has(entry.staffId) && entry.startTime && entry.endTime).flatMap((entry) => [
        { minute: Number(entry.startTime!.slice(0, 2)) * 60 + Number(entry.startTime!.slice(3, 5)), delta: 1 },
        { minute: Number(entry.endTime!.slice(0, 2)) * 60 + Number(entry.endTime!.slice(3, 5)), delta: -1 },
      ]).sort((a, b) => a.minute - b.minute || a.delta - b.delta);
      let activeChairs = 0;
      let peakChairUsage = 0;
      for (const event of chairEvents) { activeChairs += event.delta; peakChairUsage = Math.max(peakChairUsage, activeChairs); }

      rows.push({
        date: key,
        dayOfWeek: dow,
        entries,
        coverageCount,
        belowMinimum: isOpen(key, dow) && coverageCount < minimumCoverage,
        peakChairUsage,
        overChairCapacity: peakChairUsage > chairCount,
      });
    }

    const bookedAppointments = await trx.selectFrom('appointments as a').innerJoin('services as s', 's.id', 'a.service_id').select(['a.id as id', 's.duration_minutes as primaryDurationMinutes', 'a.starts_at as startsAt']).where('a.location_id', '=', locationId).where('a.starts_at', '>=', start).where('a.starts_at', '<', end).where('a.status', 'in', ['booked', 'confirmed']).execute();
    const bookedAppointmentIds = bookedAppointments.map((appointment) => appointment.id);
    const appointmentServiceLines = bookedAppointmentIds.length
      ? await trx.selectFrom('appointment_services as aps').innerJoin('services as s', 's.id', 'aps.service_id').select(['aps.appointment_id as appointmentId', 's.duration_minutes as durationMinutes']).where('aps.appointment_id', 'in', bookedAppointmentIds).execute()
      : [];
    const appointmentDurationById = new Map<string, number>();
    for (const line of appointmentServiceLines) appointmentDurationById.set(line.appointmentId, (appointmentDurationById.get(line.appointmentId) ?? 0) + line.durationMinutes);
    const availableChairMinutes = rows.reduce((sum, row) => {
      const special = specialByDate.get(row.date);
      const hours = special ? { is_open: !special.is_closed, open_time: special.open_time, close_time: special.close_time } : hoursByDay.get(row.dayOfWeek);
      if (!hours?.is_open || !hours.open_time || !hours.close_time) return sum;
      const [openHour, openMinute] = hours.open_time.split(':').map(Number);
      const [closeHour, closeMinute] = hours.close_time.split(':').map(Number);
      return sum + Math.max(0, closeHour * 60 + closeMinute - openHour * 60 - openMinute) * chairCount;
    }, 0);
    const bookedMinutes = bookedAppointments.reduce((sum, appointment) => sum + (appointmentDurationById.get(appointment.id) ?? appointment.primaryDurationMinutes), 0);
    const bookedCapacityPct = availableChairMinutes ? Math.min(100, Math.round((bookedMinutes / availableChairMinutes) * 100)) : 0;
    const bookedMinutesByDate = new Map<string, number>();
    for (const appointment of bookedAppointments) { const key = dateKey(appointment.startsAt); bookedMinutesByDate.set(key, (bookedMinutesByDate.get(key) ?? 0) + (appointmentDurationById.get(appointment.id) ?? appointment.primaryDurationMinutes)); }
    for (const row of rows) {
      const special = specialByDate.get(row.date);
      const hours = special ? { is_open: !special.is_closed, open_time: special.open_time, close_time: special.close_time } : hoursByDay.get(row.dayOfWeek);
      if (!hours?.is_open || !hours.open_time || !hours.close_time) { Object.assign(row, { bookedCapacityPct: 0 }); continue; }
      const [openHour, openMinute] = hours.open_time.split(':').map(Number); const [closeHour, closeMinute] = hours.close_time.split(':').map(Number);
      const capacityMinutes = Math.max(0, closeHour * 60 + closeMinute - openHour * 60 - openMinute) * chairCount;
      Object.assign(row, { bookedCapacityPct: capacityMinutes ? Math.min(100, Math.round(((bookedMinutesByDate.get(row.date) ?? 0) / capacityMinutes) * 100)) : 0 });
    }
    return { roster, rows, minimumCoverage, overtimeThresholdHours, chairCount, ...(managerView ? { baseHourlyLaborCost, payrollBurdenPct } : {}), bookedCapacityPct, bookedMinutes, availableChairMinutes };
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
