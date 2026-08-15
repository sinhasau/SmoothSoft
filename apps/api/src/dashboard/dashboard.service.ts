import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { db } from '../common/request-context';
import { PG_POOL } from '../db/database.module';
import { runInLocationScope } from '../db/scoped-query';
import { contactFor } from '../common/staff-contact-visibility';
import { rethrowIfSchemaBehind } from '../common/schema-readiness';
import type { StaffRole } from '../db/kysely.types';
import { dayOfWeekInTimezone, startOfDayInTimezone } from '../common/time';

/** W2/1099 classification is payroll-sensitive — only management should see it about other staff. */
function canViewClassification(role: StaffRole): boolean {
  return role === 'org_owner' || role === 'location_manager';
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

  async locationDashboard(locationId: string, requesterRole: StaffRole) {
    const trx = db();
    const location = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
    const since = startOfDayInTimezone(location.timezone);

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

    // `revenue` (= sum of subtotal) is already net of discounts (see
    // payments.service.ts checkout(): subtotal = rawSubtotal - discountAmount).
    // serviceRevenue/retailRevenue above are summed straight from
    // transaction_items.price, which is the pre-discount, item-level price —
    // so they're gross, not net. Without surfacing `discount` explicitly,
    // serviceRevenue + retailRevenue looks like it should equal `revenue`
    // and doesn't whenever any sale had a discount applied.
    const discount = todaysTxns.reduce((s, t) => s + Number(t.discount_amount), 0);
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

    const staffTodayRaw = await this.staffToday(locationId, since, location.timezone);
    const utilization = this.computeUtilization(staffTodayRaw);
    const staffToday = canViewClassification(requesterRole)
      ? staffTodayRaw
      : staffTodayRaw.map(({ classification, ...rest }) => rest);

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
        't.receipt_number as receiptNumber',
        't.created_at as createdAt',
      ])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', since)
      .orderBy('t.created_at', 'desc')
      .execute();

    const managerView = canViewClassification(requesterRole);
    return {
      ...(managerView ? { revenue, serviceRevenue: Number(serviceRevenue?.total ?? 0), retailRevenue: Number(retailRevenue?.total ?? 0), discount, tax, tips, avgTicket, cashSales, cardSales } : {}),
      clientsServed,
      utilizationPct: utilization,
      noShows,
      cancels,
      abandoned,
      staffToday,
      compliance: managerView ? compliance : [],
      lineItems: managerView ? lineItems : [],
    };
  }

  private async staffToday(locationId: string, since: Date, timezone: string) {
    const trx = db();
    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.classification as classification', 'ls.status as status'])
      .where('ls.location_id', '=', locationId)
      .execute();

    const todayDow = dayOfWeekInTimezone(timezone);

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
  /**
   * Itemized breakdown of today's transactions — one row per sale with
   * its service/retail split, tip, tax, discount, and total. Backs the
   * drill-down screen the Revenue / Clients-served stat cards link to.
   */
  async salesBreakdown(locationId: string, days = 1) {
    const trx = db();
    const location = await trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow();
    const since = startOfDayInTimezone(location.timezone);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const txns = await trx
      .selectFrom('transactions as t')
      .leftJoin('clients as c', 'c.id', 't.client_id')
      .leftJoin('location_staff as ls', 'ls.id', 't.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select([
        't.id as transactionId',
        'c.id as clientId',
        'c.name as clientName',
        'ls.id as staffId',
        'u.full_name as staffName',
        't.tax as tax',
        't.tip as tip',
        't.discount_amount as discountAmount',
        't.total as total',
        't.payment_method as paymentMethod',
        't.receipt_number as receiptNumber',
        't.created_at as createdAt',
      ])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', since)
      .orderBy('t.created_at', 'desc')
      .execute();

    const ids = txns.map((t) => t.transactionId);
    const items = ids.length
      ? await trx.selectFrom('transaction_items').select(['transaction_id', 'name', 'item_type', 'price']).where('transaction_id', 'in', ids).execute()
      : [];
    const refunds = ids.length ? await trx.selectFrom('refunds').select(['id', 'original_transaction_id', 'amount', 'reason', 'status', 'created_at']).where('original_transaction_id', 'in', ids).execute() : [];
    const refundedTotals = new Map<string, number>();
    for (const refund of refunds) if (refund.status === 'succeeded') refundedTotals.set(refund.original_transaction_id, (refundedTotals.get(refund.original_transaction_id) ?? 0) + Number(refund.amount));

    const serviceTotals = new Map<string, number>();
    const retailTotals = new Map<string, number>();
    for (const item of items) {
      const map = item.item_type === 'service' ? serviceTotals : retailTotals;
      map.set(item.transaction_id, (map.get(item.transaction_id) ?? 0) + Number(item.price));
    }

    return txns.map((t) => ({
      ...t,
      serviceTotal: serviceTotals.get(t.transactionId) ?? 0,
      retailTotal: retailTotals.get(t.transactionId) ?? 0,
      refundedAmount: refundedTotals.get(t.transactionId) ?? 0,
      items: items.filter((item) => item.transaction_id === t.transactionId).map((item) => ({ name: item.name, itemType: item.item_type, price: Number(item.price) })),
      refunds: refunds.filter((refund) => refund.original_transaction_id === t.transactionId).map((refund) => ({ id: refund.id, amount: Number(refund.amount), reason: refund.reason, status: refund.status, createdAt: refund.created_at })),
    }));
  }

  /** `viewerUserId` is only for the contact-visibility rule; scoping is by organizationId. */
  async orgDashboard(organizationId: string, viewerUserId: string) {
    // Every page in the owner workspace reads this one endpoint, so an
    // unapplied migration here is a five-page outage. Name the missing step
    // rather than returning a bare 500 across the whole workspace.
    return this.buildOrgDashboard(organizationId, viewerUserId).catch(
      rethrowIfSchemaBehind('The owner workspace', '0054'),
    );
  }

  private async buildOrgDashboard(organizationId: string, viewerUserId: string) {
    const trx = db();
    const [organization, locations] = await Promise.all([
      trx.selectFrom('organizations').select(['id', 'name']).where('id', '=', organizationId).executeTakeFirstOrThrow(),
      trx.selectFrom('locations').selectAll().where('organization_id', '=', organizationId).orderBy('name').execute(),
    ]);

    const perLocation = await Promise.all(
      locations.map(async (loc) => {
        const stats = await runInLocationScope(this.pool, organizationId, loc.id, async (scopedTrx) => {
          const since = startOfDayInTimezone(loc.timezone);
          const txns = await scopedTrx.selectFrom('transactions').selectAll().where('location_id', '=', loc.id).where('created_at', '>=', since).execute();
          const staff = await scopedTrx
            .selectFrom('location_staff as ls')
            .innerJoin('users as u', 'u.id', 'ls.user_id')
            .select([
              'ls.id as locationStaffId',
              'ls.user_id as userId',
              'u.full_name as fullName',
              // RESTRICTED. Only ever returned through contactFor() below.
              'u.phone as phone',
              'u.email as email',
              'u.address_line1 as addressLine1',
              'u.address_line2 as addressLine2',
              'u.city as city',
              'u.region as region',
              'u.postal_code as postalCode',
              'u.country as country',
              'u.emergency_contact_name as emergencyContactName',
              'u.emergency_contact_phone as emergencyContactPhone',
              'ls.role as role',
              'ls.classification as classification',
              'ls.employment_status as employmentStatus',
              'ls.status as floorStatus',
              'ls.is_primary as isPrimary',
            ])
            .where('ls.location_id', '=', loc.id)
            .execute();
          const compliance = await scopedTrx
            .selectFrom('compliance_documents')
            .selectAll()
            .where('location_id', '=', loc.id)
            .where('status', 'in', ['needs_attention', 'overdue'])
            .execute();

          const serviceRevenue = await scopedTrx
            .selectFrom('transaction_items as ti')
            .innerJoin('transactions as t', 't.id', 'ti.transaction_id')
            .select(({ fn }) => [fn.sum('ti.price').as('total')])
            .where('t.location_id', '=', loc.id)
            .where('t.created_at', '>=', since)
            .where('ti.item_type', '=', 'service')
            .executeTakeFirst();

          const retailRevenue = await scopedTrx
            .selectFrom('transaction_items as ti')
            .innerJoin('transactions as t', 't.id', 'ti.transaction_id')
            .select(({ fn }) => [fn.sum('ti.price').as('total')])
            .where('t.location_id', '=', loc.id)
            .where('t.created_at', '>=', since)
            .where('ti.item_type', '=', 'retail')
            .executeTakeFirst();

          const staffIds = staff.map((person) => person.locationStaffId);
          const compensation = staffIds.length
            ? await scopedTrx
                .selectFrom('staff_compensation_history')
                .select(['location_staff_id', 'commission_pct', 'booth_rent_weekly', 'hourly_rate', 'annual_salary', 'custom_pay_model_name', 'effective_from'])
                .where('location_staff_id', 'in', staffIds)
                .where('effective_to', 'is', null)
                .orderBy('effective_from', 'desc')
                .execute()
            : [];
          const compensationByStaff = new Map<string, (typeof compensation)[number]>();
          for (const row of compensation) if (!compensationByStaff.has(row.location_staff_id)) compensationByStaff.set(row.location_staff_id, row);

          const pendingScheduleRequests = await scopedTrx
            .selectFrom('schedule_change_requests')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .where('location_id', '=', loc.id)
            .where('status', '=', 'pending')
            .executeTakeFirst();

          const team = staff.map((person) => {
            const pay = compensationByStaff.get(person.locationStaffId);
            const compensationModel = pay?.custom_pay_model_name
              ?? (pay?.annual_salary != null ? 'salary' : pay?.hourly_rate != null ? 'hourly' : pay?.booth_rent_weekly != null ? 'booth_rent' : pay?.commission_pct != null ? 'commission' : 'not_configured');
            const {
              phone, email, addressLine1, addressLine2, city, region, postalCode, country,
              emergencyContactName, emergencyContactPhone, ...rest
            } = person;
            return {
              ...rest,
              // This endpoint is owner-only (requireOwner), so the rule always
              // grants here — routed through it anyway so there is one answer
              // to this question, and so tightening the endpoint's guard later
              // cannot silently leave contact details exposed.
              contact: contactFor(
                { userId: viewerUserId, role: 'org_owner', organizationId, locationId: loc.id },
                { userId: person.userId, organizationId, locationIds: [loc.id] },
                { phone, email, addressLine1, addressLine2, city, region, postalCode, country, emergencyContactName, emergencyContactPhone },
              ),
              locationId: loc.id,
              locationName: loc.name,
              compensationModel,
              commissionPct: pay?.commission_pct == null ? null : Number(pay.commission_pct),
              boothRentWeekly: pay?.booth_rent_weekly == null ? null : Number(pay.booth_rent_weekly),
              hourlyRate: pay?.hourly_rate == null ? null : Number(pay.hourly_rate),
              annualSalary: pay?.annual_salary == null ? null : Number(pay.annual_salary),
            };
          });

          const revenue = txns.reduce((s, t) => s + Number(t.subtotal), 0);
          const staffOnShift = staff.filter((s) => s.floorStatus !== 'off').length;
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
            serviceRevenue: Number(serviceRevenue?.total ?? 0),
            retailRevenue: Number(retailRevenue?.total ?? 0),
            // See the matching comment in locationDashboard() — serviceRevenue/
            // retailRevenue are gross (pre-discount); revenue (subtotal) is net.
            discount: txns.reduce((s, t) => s + Number(t.discount_amount), 0),
            tax: txns.reduce((s, t) => s + Number(t.tax), 0),
            tips: txns.reduce((s, t) => s + Number(t.tip), 0),
            pendingScheduleRequests: Number(pendingScheduleRequests?.count ?? 0),
            // Public shop address (0055). Read-only here; owner-only to edit.
            address: {
              addressLine1: loc.address_line1 ?? null,
              addressLine2: loc.address_line2 ?? null,
              city: loc.city ?? null,
              region: loc.region ?? null,
              postalCode: loc.postal_code ?? null,
              country: loc.country ?? null,
              phone: loc.phone ?? null,
            },
            team,
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
        retailRevenue: acc.retailRevenue + l.retailRevenue,
        discount: acc.discount + l.discount,
        salesTax: acc.salesTax + l.tax,
        tips: acc.tips + l.tips,
      }),
      {
        revenueToday: 0,
        clientsServed: 0,
        staffOnShift: 0,
        staffTotal: 0,
        complianceAlerts: 0,
        w2Count: 0,
        contractorCount: 0,
        serviceRevenue: 0,
        retailRevenue: 0,
        discount: 0,
        salesTax: 0,
        tips: 0,
      },
    );

    // Role, classification and employment status are properties of an
    // ASSIGNMENT, not of a person — the schema keys them to (location, user).
    //
    // This used to collapse them onto the person by taking whichever location
    // happened to be first, so someone managing Novi and cutting hair at South
    // Lyon showed one of the two at random, and the W-2/1099 pill could be flat
    // wrong. That is the field the product strategy calls the single biggest
    // legal exposure, so "close enough" is not acceptable.
    //
    // A person-level value is now only reported when every assignment agrees.
    // When they disagree it is null and the matching `mixed*` flag is set, so
    // the UI shows the per-assignment breakdown instead of inventing a
    // consensus that does not exist.
    const people = new Map<string, {
      userId: string;
      fullName: string;
      assignments: Array<(typeof perLocation)[number]['team'][number]>;
    }>();
    for (const location of perLocation) {
      for (const assignment of location.team) {
        const existing = people.get(assignment.userId);
        if (existing) {
          existing.assignments.push(assignment);
          continue;
        }
        people.set(assignment.userId, {
          userId: assignment.userId,
          fullName: assignment.fullName,
          assignments: [assignment],
        });
      }
    }

    const team = Array.from(people.values())
      .map((person) => {
        const distinct = <T,>(values: readonly T[]) => [...new Set(values)];
        const roles = distinct(person.assignments.map((a) => a.role));
        const classifications = distinct(person.assignments.map((a) => a.classification));
        const statuses = distinct(person.assignments.map((a) => a.employmentStatus));
        return {
          ...person,
          role: roles.length === 1 ? roles[0] : null,
          classification: classifications.length === 1 ? classifications[0] : null,
          employmentStatus: statuses.length === 1 ? statuses[0] : null,
          mixedRole: roles.length > 1,
          mixedClassification: classifications.length > 1,
          mixedEmploymentStatus: statuses.length > 1,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const actionItems = [
      ...(totals.complianceAlerts > 0 ? [{ id: 'compliance', tone: 'red' as const, title: `${totals.complianceAlerts} compliance item${totals.complianceAlerts === 1 ? '' : 's'} need attention`, href: '/org/team' }] : []),
      ...perLocation.filter((location) => location.pendingScheduleRequests > 0).map((location) => ({ id: `schedule-${location.locationId}`, tone: 'amber' as const, title: `${location.pendingScheduleRequests} schedule request${location.pendingScheduleRequests === 1 ? '' : 's'} at ${location.locationName}`, href: `/locations/${location.locationId}/schedule` })),
      ...perLocation.filter((location) => location.team.some((person) => person.compensationModel === 'not_configured')).map((location) => ({ id: `pay-${location.locationId}`, tone: 'amber' as const, title: `Compensation setup is incomplete at ${location.locationName}`, href: `/locations/${location.locationId}/staff` })),
    ];

    return {
      organization: { id: organization.id, name: organization.name },
      locations: perLocation.map(({ team: _team, ...location }) => location),
      totals,
      team,
      actionItems,
    };
  }
}
