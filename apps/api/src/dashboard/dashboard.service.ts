import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { db } from '../common/request-context';
import { PG_POOL } from '../db/database.module';
import { runInLocationScope } from '../db/scoped-query';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Module 7 (Reporting & BI) — deliberately today-only per the plan's scope
 * (matches the prototype's documented gap in HANDOFF-master.md §7: "Today-
 * only; no multi-day trends"). Historical/trend/cohort reporting is
 * explicitly out of scope for this pass.
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async locationDashboard(locationId: string) {
    const trx = db();
    const since = startOfToday();

    const todaysTxns = await trx
      .selectFrom('transactions')
      .selectAll()
      .where('location_id', '=', locationId)
      .where('created_at', '>=', since)
      .execute();

    const serviceRevenue = await trx
      .selectFrom('transaction_items as ti')
      .innerJoin('transactions as t', 't.id', 'ti.transaction_id')
      .select(({ fn }) => [fn.sum('ti.price').as('total')])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', since)
      .where('ti.item_type', '=', 'service')
      .executeTakeFirst();

    const retailRevenue = await trx
      .selectFrom('transaction_items as ti')
      .innerJoin('transactions as t', 't.id', 'ti.transaction_id')
      .select(({ fn }) => [fn.sum('ti.price').as('total')])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', since)
      .where('ti.item_type', '=', 'retail')
      .executeTakeFirst();

    const revenue = todaysTxns.reduce((s, t) => s + Number(t.subtotal), 0);
    const tips = todaysTxns.reduce((s, t) => s + Number(t.tip), 0);
    const tax = todaysTxns.reduce((s, t) => s + Number(t.tax), 0);
    const clientsServed = todaysTxns.length;
    const avgTicket = clientsServed > 0 ? revenue / clientsServed : 0;

    const cashSales = todaysTxns.filter((t) => t.payment_method === 'cash').reduce((s, t) => s + Number(t.total), 0);
    const cardSales = todaysTxns.filter((t) => t.payment_method !== 'cash').reduce((s, t) => s + Number(t.total), 0);

    const cancelledToday = await trx
      .selectFrom('queue_entries')
      .select(['status', 'abandoned'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', since)
      .where('status', 'in', ['cancelled', 'no_show'])
      .execute();
    const noShows = cancelledToday.filter((e) => e.status === 'no_show').length;
    const abandoned = cancelledToday.filter((e) => e.abandoned).length;
    const cancels = cancelledToday.filter((e) => e.status === 'cancelled' && !e.abandoned).length;

    const staffToday = await this.staffToday(locationId, since);
    const utilization = this.computeUtilization(staffToday);

    const compliance = await trx
      .selectFrom('compliance_documents as cd')
      .leftJoin('location_staff as ls', 'ls.id', 'cd.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select(['cd.id as id', 'cd.doc_type as docType', 'cd.description as description', 'cd.expires_at as expiresAt', 'cd.status as status', 'u.full_name as staffName'])
      .where('cd.location_id', '=', locationId)
      .where('cd.status', 'in', ['needs_attention', 'overdue'])
      .execute();

    const lineItems = await trx
      .selectFrom('transactions as t')
      .leftJoin('clients as c', 'c.id', 't.client_id')
      .leftJoin('location_staff as ls', 'ls.id', 't.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .innerJoin('transaction_items as ti', 'ti.transaction_id', 't.id')
      .select([
        't.id as transactionId',
        'c.id as clientId',
        'c.name as clientName',
        'ls.id as staffId',
        'u.full_name as staffName',
        'ti.name as serviceName',
        'ti.price as billed',
        't.tip as tip',
        't.payment_method as paymentMethod',
        't.created_at as createdAt',
      ])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', since)
      .orderBy('t.created_at', 'desc')
      .execute();

    return {
      revenue,
      serviceRevenue: Number(serviceRevenue?.total ?? 0),
      retailRevenue: Number(retailRevenue?.total ?? 0),
      tax,
      tips,
      clientsServed,
      avgTicket,
      utilizationPct: utilization,
      cashSales,
      cardSales,
      noShows,
      cancels,
      abandoned,
      staffToday,
      compliance,
      lineItems,
    };
  }

  private async staffToday(locationId: string, since: Date) {
    const trx = db();
    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.classification as classification', 'ls.status as status'])
      .where('ls.location_id', '=', locationId)
      .execute();

    const todayDow = new Date().getDay();

    const results = [];
    for (const person of roster) {
      const txns = await trx
        .selectFrom('transactions')
        .selectAll()
        .where('location_staff_id', '=', person.locationStaffId)
        .where('created_at', '>=', since)
        .execute();

      const scheduled = await trx
        .selectFrom('staff_schedule_days')
        .selectAll()
        .where('location_staff_id', '=', person.locationStaffId)
        .where('day_of_week', '=', todayDow)
        .executeTakeFirst();

      const clients = txns.length;
      const revenue = txns.reduce((s, t) => s + Number(t.subtotal), 0);

      results.push({
        locationStaffId: person.locationStaffId,
        fullName: person.fullName,
        classification: person.classification,
        clients,
        revenue,
        status: person.status,
        scheduledToday: !!scheduled,
        scheduledMinutes: scheduled ? this.minutesBetween(scheduled.start_time, scheduled.end_time) : 0,
      });
    }
    return results;
  }

  private minutesBetween(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }

  private computeUtilization(staffToday: Awaited<ReturnType<DashboardService['staffToday']>>): number {
    const active = staffToday.filter((s) => s.scheduledToday && s.scheduledMinutes > 0);
    if (active.length === 0) return 0;
    const totalScheduled = active.reduce((s, p) => s + p.scheduledMinutes, 0);
    // Approximation: 30 minutes of chair time per client served today,
    // since we don't have per-service durations joined onto transactions
    // directly. Good enough for a today-only utilization estimate; a
    // proper version would sum actual queue_entries service durations.
    const totalServedMinutesEstimate = staffToday.reduce((s, p) => s + p.clients * 30, 0);
    return Math.min(100, Math.round((totalServedMinutesEstimate / totalScheduled) * 100));
  }

  /**
   * Cross-location Owner dashboard. Uses runInLocationScope per location
   * rather than weakening RLS — every read is still tenant-scoped, this
   * just runs the same scoped query N times and aggregates the results in
   * application code. See db/scoped-query.ts.
   */
  async orgDashboard(organizationId: string) {
    const trx = db();
    const locations = await trx.selectFrom('locations').selectAll().where('organization_id', '=', organizationId).execute();

    const perLocation = await Promise.all(
      locations.map(async (loc) => {
        const stats = await runInLocationScope(this.pool, organizationId, loc.id, async (scopedTrx) => {
          const since = startOfToday();
          const txns = await scopedTrx.selectFrom('transactions').selectAll().where('location_id', '=', loc.id).where('created_at', '>=', since).execute();
          const staff = await scopedTrx.selectFrom('location_staff').selectAll().where('location_id', '=', loc.id).execute();
          const compliance = await scopedTrx
            .selectFrom('compliance_documents')
            .selectAll()
            .where('location_id', '=', loc.id)
            .where('status', 'in', ['needs_attention', 'overdue'])
            .execute();

          const revenue = txns.reduce((s, t) => s + Number(t.subtotal), 0);
          const staffOnShift = staff.filter((s) => s.status !== 'off').length;
          const worstCompliance = compliance.some((c) => c.status === 'overdue')
            ? 'overdue'
            : compliance.length > 0
              ? 'needs_attention'
              : 'compliant';

          return {
            clientsServed: txns.length,
            revenue,
            staffOnShift,
            staffTotal: staff.length,
            complianceStatus: worstCompliance,
            complianceAlerts: compliance.length,
            w2Count: staff.filter((s) => s.classification === 'w2').length,
            contractorCount: staff.filter((s) => s.classification === '1099').length,
            serviceRevenue: txns.reduce((s, t) => s + Number(t.subtotal), 0),
            tax: txns.reduce((s, t) => s + Number(t.tax), 0),
            tips: txns.reduce((s, t) => s + Number(t.tip), 0),
          };
        });

        return { locationId: loc.id, locationName: loc.name, ...stats };
      }),
    );

    const totals = perLocation.reduce(
      (acc, l) => ({
        revenueToday: acc.revenueToday + l.revenue,
        clientsServed: acc.clientsServed + l.clientsServed,
        staffOnShift: acc.staffOnShift + l.staffOnShift,
        staffTotal: acc.staffTotal + l.staffTotal,
        complianceAlerts: acc.complianceAlerts + l.complianceAlerts,
        w2Count: acc.w2Count + l.w2Count,
        contractorCount: acc.contractorCount + l.contractorCount,
        serviceRevenue: acc.serviceRevenue + l.serviceRevenue,
        salesTax: acc.salesTax + l.tax,
        tips: acc.tips + l.tips,
      }),
      { revenueToday: 0, clientsServed: 0, staffOnShift: 0, staffTotal: 0, complianceAlerts: 0, w2Count: 0, contractorCount: 0, serviceRevenue: 0, salesTax: 0, tips: 0 },
    );

    return { locations: perLocation, totals };
  }
}
