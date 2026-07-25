import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import { buildStaffPayPdf, buildStaffPayWorkbook, StaffPayReport } from './staff-pay-export';
import { compensationChangedDuringPeriod } from './staff-pay.rules';

export const REPORT_IDS = [
  'revenue_trend',
  'revenue_by_staff',
  'payment_mix',
  'discount_usage',
  'no_show_trend',
  'staff_scheduled_hours',
  'compliance_status',
  'top_clients',
  'new_vs_returning',
  'top_services_products',
  'tax_documentation',
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive [from, to] range parsed into a query-ready exclusive end and the list of day keys in between. Defaults to trailing 30 days. */
function parseRange(from?: string, to?: string): { start: Date; endExclusive: Date; days: string[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = from ? new Date(`${from}T00:00:00`) : new Date(today.getTime() - 29 * 86400000);
  const end = to ? new Date(`${to}T00:00:00`) : today;
  const endExclusive = new Date(end.getTime() + 86400000);

  const days: string[] = [];
  for (let d = new Date(start); d < endExclusive; d = new Date(d.getTime() + 86400000)) {
    days.push(toDayKey(d));
  }
  return { start, endExclusive, days };
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/**
 * Historical/trend reporting, deliberately kept out of the today-only
 * DashboardService (see its module comment). Each method takes an optional
 * from/to date range (YYYY-MM-DD) and defaults to the trailing 30 days.
 */
@Injectable()
export class ReportsService {
  async taxDocumentation(locationId: string) {
    const trx = db();
    const [location, staff, featureSettings] = await Promise.all([
      trx.selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow(),
      trx.selectFrom('location_staff as ls').leftJoin('employee_tax_identities as eti', 'eti.location_staff_id', 'ls.id').select(['ls.classification as classification', 'eti.location_staff_id as taxIdentityOnFile']).where('ls.location_id', '=', locationId).where('ls.employment_status', '=', 'active').execute(),
      trx.selectFrom('location_feature_settings').select('retail_products_enabled').where('location_id', '=', locationId).executeTakeFirst(),
    ]);
    const w2Count = staff.filter((person) => person.classification === 'w2').length;
    const contractorCount = staff.filter((person) => person.classification === '1099').length;
    const w2TaxIdentityCount = staff.filter((person) => person.classification === 'w2' && person.taxIdentityOnFile).length;
    const missingW2TaxIdentityCount = Math.max(0, w2Count - w2TaxIdentityCount);
    const rows = [
      { area: 'Federal payroll', form: 'Form 941', cadence: 'Quarterly', deadline: 'Apr 30 · Jul 31 · Oct 31 · Jan 31', applies: w2Count > 0, readiness: 'needs_payroll_provider', detail: 'Federal withholding, Social Security, Medicare, wages, and reported tips.', officialUrl: 'https://www.irs.gov/forms-pubs/about-form-941' },
      { area: 'Federal unemployment', form: 'Form 940', cadence: 'Annual', deadline: 'Generally Jan 31', applies: w2Count > 0, readiness: 'needs_payroll_provider', detail: 'Federal unemployment wages and tax.', officialUrl: 'https://www.irs.gov/forms-pubs/about-form-940' },
      { area: 'Employee statements', form: 'Forms W-2 / W-3', cadence: 'Annual', deadline: 'Jan 31', applies: w2Count > 0, readiness: missingW2TaxIdentityCount > 0 ? 'missing_employee_tax_identity' : 'needs_payroll_provider', detail: `${w2Count} active W-2 employee${w2Count === 1 ? '' : 's'}. ${missingW2TaxIdentityCount ? `${missingW2TaxIdentityCount} still need${missingW2TaxIdentityCount === 1 ? 's' : ''} an SSN on file. ` : ''}Filing also requires your legal employer details, wages, withholding, and reported tips.`, officialUrl: 'https://www.ssa.gov/employer/filingDeadlines.htm' },
      { area: 'Contractor statements', form: 'Form 1099-NEC', cadence: 'Annual', deadline: 'Generally Jan 31', applies: contractorCount > 0, readiness: 'needs_payout_data', detail: `${contractorCount} active 1099 contractor${contractorCount === 1 ? '' : 's'}. Filing requires verified payments and a completed W-9 for each contractor.`, officialUrl: 'https://www.irs.gov/forms-pubs/about-form-1099-nec' },
      { area: 'Michigan sales & withholding', form: 'SUW return / worksheet', cadence: 'Assigned monthly, quarterly, or annual', deadline: 'Generally the 20th after the period', applies: true, readiness: 'supporting_report_ready', detail: `SmoothSoft tracks taxable retail sales${featureSettings?.retail_products_enabled === false ? ', although retail is currently disabled' : ''}; withholding still requires payroll data.`, officialUrl: 'https://www.michigan.gov/taxes/business-taxes/sales-use-tax/information/filing-requirements-faq' },
      { area: 'Michigan annual reconciliation', form: 'Form 5081', cadence: 'Annual', deadline: 'Feb 28', applies: true, readiness: 'supporting_report_ready', detail: 'Annual reconciliation does not replace assigned monthly or quarterly SUW returns.', officialUrl: 'https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/5081.pdf' },
      { area: 'Michigan unemployment', form: 'UIA quarterly wage/tax report', cadence: 'Quarterly', deadline: 'Jan 25 · Apr 25 · Jul 25 · Oct 25', applies: w2Count > 0, readiness: 'needs_payroll_provider', detail: 'Requires covered-worker wages and unemployment account information.', officialUrl: 'https://www.michigan.gov/leo/bureaus-agencies/uia/employers/frequently-asked-questions-for-employers/for-employers/quarterly-reports' },
      { area: 'Business income tax', form: 'Entity return / owner schedules', cadence: 'Annual', deadline: 'Depends on tax election and fiscal year', applies: true, readiness: 'needs_tax_profile', detail: 'Your filing depends on the business tax election, not only whether the business is an LLC.', officialUrl: 'https://www.irs.gov/businesses/small-businesses-self-employed/filing-and-paying-your-business-taxes' },
    ].filter((row) => row.applies);
    const setup = [
      { label: 'Classify active workers', complete: staff.every((person) => person.classification === 'w2' || person.classification === '1099'), detail: `${w2Count} W-2 · ${contractorCount} 1099` },
      { label: 'Collect W-2 employee SSNs', complete: missingW2TaxIdentityCount === 0, detail: w2Count === 0 ? 'No active W-2 employees' : `${w2TaxIdentityCount} of ${w2Count} stored securely` },
      { label: 'Connect an authorized payroll provider', complete: false, detail: 'Required for withholding, tax deposits, filings, and W-2 delivery' },
      { label: 'Complete employer tax profile', complete: false, detail: 'Legal name, EIN, federal/state deposit schedules, Michigan withholding and UIA accounts' },
      { label: 'Verify actual wages, hours, and tips', complete: false, detail: 'Scheduled hours are not verified time worked' },
    ];
    return { rows, setup, jurisdiction: location.timezone === 'America/Detroit' ? 'Federal + Michigan' : 'Federal; state setup required', warnings: ['SmoothSoft organizes supporting records but does not file taxes or provide tax advice.', 'Connect a payroll provider and complete the employer tax profile before issuing W-2s.'] };
  }
  async revenueTrend(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive, days } = parseRange(from, to);

    const txns = await trx
      .selectFrom('transactions')
      .select(['id', 'subtotal', 'tax', 'tip', 'discount_amount', 'total', 'created_at'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', start)
      .where('created_at', '<', endExclusive)
      .execute();

    const ids = txns.map((t) => t.id);
    const items = ids.length
      ? await trx.selectFrom('transaction_items').select(['transaction_id', 'item_type', 'price']).where('transaction_id', 'in', ids).execute()
      : [];
    const serviceByTxn = new Map<string, number>();
    const retailByTxn = new Map<string, number>();
    for (const item of items) {
      const map = item.item_type === 'service' ? serviceByTxn : retailByTxn;
      map.set(item.transaction_id, (map.get(item.transaction_id) ?? 0) + Number(item.price));
    }

    const byDay = new Map(days.map((d) => [d, { date: d, services: 0, products: 0, discount: 0, tax: 0, tip: 0, total: 0, transactions: 0 }]));
    for (const t of txns) {
      const key = toDayKey(new Date(t.created_at));
      const row = byDay.get(key);
      if (!row) continue;
      row.services += serviceByTxn.get(t.id) ?? 0;
      row.products += retailByTxn.get(t.id) ?? 0;
      row.discount += Number(t.discount_amount);
      row.tax += Number(t.tax);
      row.tip += Number(t.tip);
      row.total += Number(t.total);
      row.transactions += 1;
    }

    const rows = Array.from(byDay.values()).map((r) => ({ ...r, revenue: r.services + r.products - r.discount }));
    const totals = rows.reduce(
      (acc, r) => ({
        services: acc.services + r.services,
        products: acc.products + r.products,
        discount: acc.discount + r.discount,
        tax: acc.tax + r.tax,
        tip: acc.tip + r.tip,
        total: acc.total + r.total,
        transactions: acc.transactions + r.transactions,
        revenue: acc.revenue + r.revenue,
      }),
      { services: 0, products: 0, discount: 0, tax: 0, tip: 0, total: 0, transactions: 0, revenue: 0 },
    );

    return { rows, totals };
  }

  async revenueByStaff(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive, days } = parseRange(from, to);

    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName', 'ls.classification as classification'])
      .where('ls.location_id', '=', locationId)
      .execute();

    const txns = await trx
      .selectFrom('transactions')
      .select(['id', 'location_staff_id', 'tip', 'total', 'created_at'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', start)
      .where('created_at', '<', endExclusive)
      .execute();

    const ids = txns.map((t) => t.id);
    const pricingPolicy = await trx.selectFrom('location_pricing_policy').select('credit_surcharge_to_staff').where('location_id', '=', locationId).executeTakeFirst();
    const creditRequestPremiumToStaff = pricingPolicy?.credit_surcharge_to_staff ?? true;
    const items = ids.length
      ? await trx.selectFrom('transaction_items').select(['transaction_id', 'item_type', 'name', 'price']).where('transaction_id', 'in', ids).execute()
      : [];
    const serviceByTxn = new Map<string, number>();
    const retailByTxn = new Map<string, number>();
    for (const item of items) {
      if (!creditRequestPremiumToStaff && item.name === 'Requested barber premium') continue;
      const map = item.item_type === 'service' ? serviceByTxn : retailByTxn;
      map.set(item.transaction_id, (map.get(item.transaction_id) ?? 0) + Number(item.price));
    }

    const refunds = ids.length
      ? await trx
          .selectFrom('refunds')
          .select(['original_transaction_id', 'amount'])
          .where('original_transaction_id', 'in', ids)
          .where('status', '=', 'succeeded')
          .execute()
      : [];
    const refundByTxn = new Map<string, number>();
    for (const refund of refunds) refundByTxn.set(refund.original_transaction_id, (refundByTxn.get(refund.original_transaction_id) ?? 0) + Number(refund.amount));

    const scheduled = await this.staffScheduledHours(locationId, from, to);
    const scheduledHoursByStaff = new Map(scheduled.rows.map((row) => [row.locationStaffId, row.scheduledHours]));

    const compensationByStaff = new Map<string, { commissionPct: number | null; boothRentWeekly: number | null; hourlyRate: number | null; annualSalary: number | null; customPayModelName: string | null; effectiveFrom: Date; changedMidPeriod: boolean }>();
    for (const person of roster) {
      // All compensation rows in effect at any point during the period, newest first. The pay run
      // applies a single rate (the newest) to the whole period; when more than one row overlaps, the
      // rate changed mid-period and the estimate is flagged for review (see compensationChangedDuringPeriod).
      const compensationRows = await trx
        .selectFrom('staff_compensation_history')
        .select(['commission_pct', 'booth_rent_weekly', 'hourly_rate', 'annual_salary', 'custom_pay_model_name', 'effective_from', 'effective_to'])
        .where('location_staff_id', '=', person.locationStaffId)
        .where('effective_from', '<', endExclusive)
        .where((eb) => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', start)]))
        .orderBy('effective_from', 'desc')
        .execute();
      const compensation = compensationRows[0];
      if (compensation) {
        compensationByStaff.set(person.locationStaffId, {
          commissionPct: compensation.commission_pct === null ? null : Number(compensation.commission_pct),
          boothRentWeekly: compensation.booth_rent_weekly === null ? null : Number(compensation.booth_rent_weekly),
          hourlyRate: compensation.hourly_rate === null ? null : Number(compensation.hourly_rate),
          annualSalary: compensation.annual_salary === null ? null : Number(compensation.annual_salary),
          customPayModelName: compensation.custom_pay_model_name,
          effectiveFrom: compensation.effective_from,
          changedMidPeriod: compensationChangedDuringPeriod(
            compensationRows.map((row) => ({ effectiveFrom: row.effective_from, effectiveTo: row.effective_to })),
            start,
            endExclusive,
          ),
        });
      }
    }

    const byStaff = new Map(
      roster.map((s) => [s.locationStaffId, {
        locationStaffId: s.locationStaffId,
        fullName: s.fullName,
        classification: s.classification,
        clients: 0,
        services: 0,
        products: 0,
        tips: 0,
        refunds: 0,
        collected: 0,
      }]),
    );
    for (const t of txns) {
      if (!t.location_staff_id) continue;
      const row = byStaff.get(t.location_staff_id);
      if (!row) continue;
      row.clients += 1;
      row.services += serviceByTxn.get(t.id) ?? 0;
      row.products += retailByTxn.get(t.id) ?? 0;
      row.tips += Number(t.tip);
      row.refunds += refundByTxn.get(t.id) ?? 0;
      row.collected += Number(t.total);
    }

    const periodWeeks = days.length / 7;
    const rows = Array.from(byStaff.values()).map((row) => {
      const comp = compensationByStaff.get(row.locationStaffId);
      const revenueBeforeRefunds = row.services + row.products;
      const refundRatio = revenueBeforeRefunds > 0 ? Math.min(1, row.refunds / revenueBeforeRefunds) : 0;
      const netServices = row.services * (1 - refundRatio);
      const netProducts = row.products * (1 - refundRatio);
      const netRevenue = netServices + netProducts;
      const commissionPay = comp?.commissionPct == null ? 0 : netServices * (comp.commissionPct / 100);
      const boothRent = comp?.boothRentWeekly == null ? 0 : comp.boothRentWeekly * periodWeeks;
      const scheduledHours = scheduledHoursByStaff.get(row.locationStaffId) ?? 0;
      const hourlyPay = comp?.hourlyRate == null ? 0 : comp.hourlyRate * scheduledHours;
      const salaryPay = comp?.annualSalary == null ? 0 : comp.annualSalary * (days.length / 365);
      const baseCompensationModel = comp?.annualSalary != null ? 'salary' : comp?.hourlyRate != null ? 'hourly' : comp?.boothRentWeekly != null ? 'booth_rent' : comp?.commissionPct != null ? 'commission' : 'not_configured';
      const compensationModel = comp?.customPayModelName ?? baseCompensationModel;
      const estimatedPay = baseCompensationModel === 'booth_rent'
        ? netRevenue + row.tips - boothRent
        : baseCompensationModel === 'commission'
          ? commissionPay + row.tips
          : baseCompensationModel === 'hourly'
            ? hourlyPay + row.tips
            : baseCompensationModel === 'salary'
              ? salaryPay + row.tips
          : null;
      return {
        ...row,
        scheduledHours,
        netServices,
        netProducts,
        netRevenue,
        compensationModel,
        commissionPct: comp?.commissionPct ?? null,
        commissionPay,
        boothRent,
        hourlyRate: comp?.hourlyRate ?? null,
        hourlyPay,
        annualSalary: comp?.annualSalary ?? null,
        salaryPay,
        basePay: baseCompensationModel === 'commission' ? commissionPay : baseCompensationModel === 'hourly' ? hourlyPay : baseCompensationModel === 'salary' ? salaryPay : 0,
        tipsPayable: row.tips,
        estimatedPay,
        needsConfiguration: baseCompensationModel === 'not_configured',
        compensationChangedMidPeriod: comp?.changedMidPeriod ?? false,
      };
    }).sort((a, b) => (b.estimatedPay ?? -1) - (a.estimatedPay ?? -1));

    const midPeriodChangeNames = rows.filter((row) => row.compensationChangedMidPeriod).map((row) => row.fullName);

    const totals = rows.reduce((acc, row) => ({
      clients: acc.clients + row.clients,
      services: acc.services + row.services,
      products: acc.products + row.products,
      refunds: acc.refunds + row.refunds,
      netRevenue: acc.netRevenue + row.netRevenue,
      tips: acc.tips + row.tips,
      estimatedPay: acc.estimatedPay + (row.estimatedPay ?? 0),
      payableToStaff: acc.payableToStaff + Math.max(row.estimatedPay ?? 0, 0),
      dueToShop: acc.dueToShop + Math.max(-(row.estimatedPay ?? 0), 0),
      scheduledHours: acc.scheduledHours + row.scheduledHours,
    }), { clients: 0, services: 0, products: 0, refunds: 0, netRevenue: 0, tips: 0, estimatedPay: 0, payableToStaff: 0, dueToShop: 0, scheduledHours: 0 });

    return {
      rows,
      totals,
      period: { from: toDayKey(start), to: toDayKey(new Date(endExclusive.getTime() - 86400000)), days: days.length },
      warnings: [
        'Estimated settlement does not include taxes, withholding, benefits, overtime, or unverified hours.',
        'Confirm actual hours worked before running payroll; scheduled hours are planning estimates.',
        'Refunds are allocated proportionally across service and retail revenue.',
        creditRequestPremiumToStaff ? 'Earned requested-professional premiums are credited to staff service revenue.' : 'Requested-professional premiums remain shop revenue and are excluded from staff commission calculations.',
        ...(midPeriodChangeNames.length
          ? [`Pay rate changed mid-period for ${midPeriodChangeNames.join(', ')}. This estimate applies their latest rate to the whole period — review or prorate before paying.`]
          : []),
      ],
    };
  }

  async logStaffPayRun(locationId: string, actorUserId: string, from: string, to: string, notes?: string) {
    const snapshot = await this.revenueByStaff(locationId, from, to);
    return db().insertInto('staff_pay_runs').values({
      location_id: locationId,
      period_start: from,
      period_end: to,
      notes: notes?.trim() || null,
      snapshot: snapshot as unknown as Record<string, unknown>,
      logged_by_user_id: actorUserId,
      paid_at: null,
    }).returning(['id', 'period_start as periodStart', 'period_end as periodEnd', 'status', 'logged_at as loggedAt']).executeTakeFirstOrThrow();
  }

  async getStaffPayRuns(locationId: string) {
    const runs = await db().selectFrom('staff_pay_runs as spr').leftJoin('users as u', 'u.id', 'spr.logged_by_user_id').select(['spr.id as id', 'spr.period_start as periodStart', 'spr.period_end as periodEnd', 'spr.status as status', 'spr.notes as notes', 'spr.snapshot as snapshot', 'spr.logged_at as loggedAt', 'spr.paid_at as paidAt', 'u.full_name as loggedBy']).where('spr.location_id', '=', locationId).orderBy('spr.logged_at', 'desc').limit(25).execute();
    return runs.map(({ snapshot, ...run }) => { const report = snapshot as unknown as StaffPayReport; return { ...run, staffCount: report.rows?.length ?? 0, totals: report.totals ?? {} }; });
  }

  async exportLoggedStaffPayRun(locationId: string, actorUserId: string, id: string, format: 'pdf' | 'xlsx') {
    const [run, location] = await Promise.all([
      db().selectFrom('staff_pay_runs').selectAll().where('id', '=', id).where('location_id', '=', locationId).executeTakeFirst(),
      db().selectFrom('locations').select('name').where('id', '=', locationId).executeTakeFirstOrThrow(),
    ]);
    if (!run) throw new NotFoundException('Logged pay period not found');
    const report = run.snapshot as unknown as StaffPayReport;
    const buffer = format === 'xlsx' ? await buildStaffPayWorkbook(report, location.name) : await buildStaffPayPdf(report, location.name);
    await db().insertInto('report_exports').values({ location_id: locationId, report_id: 'staff_pay_run', format, period_start: run.period_start, period_end: run.period_end, exported_by_user_id: actorUserId, parameters: { staffPayRunId: id, immutableSnapshot: true } }).execute();
    return { buffer, period: report.period };
  }

  async exportStaffPayReport(locationId: string, actorUserId: string, format: 'pdf' | 'xlsx', from?: string, to?: string) {
    const report = await this.revenueByStaff(locationId, from, to) as StaffPayReport;
    const location = await db().selectFrom('locations').select('name').where('id', '=', locationId).executeTakeFirstOrThrow();
    const buffer = format === 'xlsx' ? await buildStaffPayWorkbook(report, location.name) : await buildStaffPayPdf(report, location.name);
    await db().insertInto('report_exports').values({
      location_id: locationId,
      report_id: 'revenue_by_staff',
      format,
      period_start: report.period.from,
      period_end: report.period.to,
      exported_by_user_id: actorUserId,
      parameters: { warnings: report.warnings },
    }).execute();
    return { buffer, period: report.period };
  }

  async paymentMix(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive, days } = parseRange(from, to);

    const txns = await trx
      .selectFrom('transactions')
      .select(['payment_method', 'total', 'created_at'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', start)
      .where('created_at', '<', endExclusive)
      .execute();

    const byDay = new Map(days.map((d) => [d, { date: d, cash: 0, card: 0 }]));
    for (const t of txns) {
      const row = byDay.get(toDayKey(new Date(t.created_at)));
      if (!row) continue;
      if (t.payment_method === 'cash') row.cash += Number(t.total);
      else row.card += Number(t.total);
    }

    const rows = Array.from(byDay.values());
    const totals = rows.reduce((acc, r) => ({ cash: acc.cash + r.cash, card: acc.card + r.card }), { cash: 0, card: 0 });
    return { rows, totals };
  }

  async discountUsage(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive } = parseRange(from, to);

    const txns = await trx
      .selectFrom('transactions')
      .select(['discount_code_id', 'discount_amount', 'total'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', start)
      .where('created_at', '<', endExclusive)
      .where('discount_code_id', 'is not', null)
      .execute();

    if (txns.length === 0) return { rows: [] };

    const codeIds = [...new Set(txns.map((t) => t.discount_code_id!))];
    const codes = await trx.selectFrom('discount_codes').select(['id', 'code']).where('id', 'in', codeIds).execute();
    const codeById = new Map(codes.map((c) => [c.id, c.code]));

    const byCode = new Map<string, { discountCodeId: string; code: string; timesUsed: number; totalDiscount: number; revenueAfterDiscount: number }>();
    for (const t of txns) {
      const id = t.discount_code_id!;
      const row = byCode.get(id) ?? { discountCodeId: id, code: codeById.get(id) ?? '(deleted code)', timesUsed: 0, totalDiscount: 0, revenueAfterDiscount: 0 };
      row.timesUsed += 1;
      row.totalDiscount += Number(t.discount_amount);
      row.revenueAfterDiscount += Number(t.total);
      byCode.set(id, row);
    }

    return { rows: Array.from(byCode.values()).sort((a, b) => b.timesUsed - a.timesUsed) };
  }

  async noShowTrend(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive, days } = parseRange(from, to);

    const entries = await trx
      .selectFrom('queue_entries')
      .select(['status', 'abandoned', 'created_at'])
      .where('location_id', '=', locationId)
      .where('created_at', '>=', start)
      .where('created_at', '<', endExclusive)
      .execute();

    const byDay = new Map(days.map((d) => [d, { date: d, completed: 0, noShows: 0, cancels: 0, abandoned: 0, total: 0 }]));
    for (const e of entries) {
      const row = byDay.get(toDayKey(new Date(e.created_at)));
      if (!row) continue;
      row.total += 1;
      if (e.status === 'completed') row.completed += 1;
      else if (e.status === 'no_show') row.noShows += 1;
      else if (e.status === 'cancelled' && e.abandoned) row.abandoned += 1;
      else if (e.status === 'cancelled') row.cancels += 1;
    }

    const rows = Array.from(byDay.values()).map((r) => ({
      ...r,
      noShowRatePct: r.total > 0 ? Math.round(((r.noShows + r.cancels + r.abandoned) / r.total) * 100) : 0,
    }));
    return { rows };
  }

  async staffScheduledHours(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive, days } = parseRange(from, to);

    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName'])
      .where('ls.location_id', '=', locationId)
      .execute();

    const weekly = await trx
      .selectFrom('staff_schedule_days')
      .selectAll()
      .where(
        'location_staff_id',
        'in',
        roster.map((r) => r.locationStaffId),
      )
      .execute();

    const exceptions = await trx
      .selectFrom('schedule_exceptions')
      .selectAll()
      .where('location_id', '=', locationId)
      .where('work_date', '>=', toDayKey(start))
      .where('work_date', '<', toDayKey(endExclusive))
      .execute();

    const weeklyByStaffDow = new Map<string, (typeof weekly)[number]>();
    for (const w of weekly) weeklyByStaffDow.set(`${w.location_staff_id}:${w.day_of_week}`, w);
    const exceptionByStaffDate = new Map<string, (typeof exceptions)[number]>();
    for (const ex of exceptions) exceptionByStaffDate.set(`${ex.location_staff_id}:${ex.work_date}`, ex);

    const rows = roster.map((person) => {
      let minutes = 0;
      for (const day of days) {
        const exception = exceptionByStaffDate.get(`${person.locationStaffId}:${day}`);
        if (exception) {
          if (exception.is_working && exception.start_time && exception.end_time) minutes += minutesBetween(exception.start_time, exception.end_time);
          continue;
        }
        const dow = new Date(`${day}T00:00:00`).getDay();
        const scheduled = weeklyByStaffDow.get(`${person.locationStaffId}:${dow}`);
        if (scheduled) minutes += minutesBetween(scheduled.start_time, scheduled.end_time);
      }
      return { locationStaffId: person.locationStaffId, fullName: person.fullName, scheduledHours: Math.round((minutes / 60) * 10) / 10 };
    });

    return { rows: rows.sort((a, b) => b.scheduledHours - a.scheduledHours) };
  }

  async complianceStatus(locationId: string) {
    const trx = db();
    const [staff, documents] = await Promise.all([trx.selectFrom('location_staff as ls').innerJoin('users as u', 'u.id', 'ls.user_id').select(['ls.id as locationStaffId', 'u.full_name as staffName']).where('ls.location_id', '=', locationId).where('ls.employment_status', '=', 'active').orderBy('u.full_name').execute(), trx
      .selectFrom('compliance_documents as cd')
      .leftJoin('location_staff as ls', 'ls.id', 'cd.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select(['cd.id as id', 'cd.location_staff_id as locationStaffId', 'cd.doc_type as docType', 'cd.description as description', 'cd.expires_at as expiresAt', 'cd.status as status', 'u.full_name as staffName'])
      .where('cd.location_id', '=', locationId)
      .orderBy((eb) => eb.case().when('cd.status', '=', 'overdue').then(0).when('cd.status', '=', 'needs_attention').then(1).else(2).end())
      .orderBy('cd.expires_at', 'asc')
      .execute()]);
    const staffWithDocuments = new Set(documents.map((document) => document.locationStaffId).filter(Boolean));
    const rows = [...documents, ...staff.filter((person) => !staffWithDocuments.has(person.locationStaffId)).map((person) => ({ id: `missing-${person.locationStaffId}`, locationStaffId: person.locationStaffId, staffName: person.staffName, docType: 'No documents on file', description: null, expiresAt: null, status: 'not_on_file' as const }))];
    return { rows };
  }

  async topClients(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive } = parseRange(from, to);

    const txns = await trx
      .selectFrom('transactions as t')
      .innerJoin('clients as c', 'c.id', 't.client_id')
      .select(['c.id as clientId', 'c.name as clientName', 't.total as total', 't.created_at as createdAt'])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', start)
      .where('t.created_at', '<', endExclusive)
      .execute();

    const byClient = new Map<string, { clientId: string; clientName: string; visits: number; totalSpent: number; lastVisit: Date }>();
    for (const t of txns) {
      const row = byClient.get(t.clientId) ?? { clientId: t.clientId, clientName: t.clientName, visits: 0, totalSpent: 0, lastVisit: t.createdAt };
      row.visits += 1;
      row.totalSpent += Number(t.total);
      if (t.createdAt > row.lastVisit) row.lastVisit = t.createdAt;
      byClient.set(t.clientId, row);
    }

    const rows = Array.from(byClient.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 25);
    return { rows };
  }

  async newVsReturning(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive, days } = parseRange(from, to);

    // First-ever transaction date per client, all-time, not just this range —
    // determines whether a visit inside the range is that client's first visit.
    const allTxns = await trx
      .selectFrom('transactions')
      .select(['client_id', 'created_at'])
      .where('location_id', '=', locationId)
      .where('client_id', 'is not', null)
      .where('created_at', '<', endExclusive)
      .execute();

    const firstSeen = new Map<string, Date>();
    for (const t of allTxns) {
      const id = t.client_id!;
      const existing = firstSeen.get(id);
      if (!existing || t.created_at < existing) firstSeen.set(id, t.created_at);
    }

    const byDay = new Map(days.map((d) => [d, { date: d, newClients: new Set<string>(), returningClients: new Set<string>() }]));
    for (const t of allTxns) {
      if (t.created_at < start) continue;
      const key = toDayKey(t.created_at);
      const row = byDay.get(key);
      if (!row) continue;
      const first = firstSeen.get(t.client_id!);
      if (first && toDayKey(first) === key) row.newClients.add(t.client_id!);
      else row.returningClients.add(t.client_id!);
    }

    const rows = Array.from(byDay.values()).map((r) => ({ date: r.date, newClients: r.newClients.size, returningClients: r.returningClients.size }));
    return { rows };
  }

  async topServicesAndProducts(locationId: string, from?: string, to?: string) {
    const trx = db();
    const { start, endExclusive } = parseRange(from, to);

    const items = await trx
      .selectFrom('transaction_items as ti')
      .innerJoin('transactions as t', 't.id', 'ti.transaction_id')
      .select(['ti.name as name', 'ti.item_type as itemType', 'ti.price as price'])
      .where('t.location_id', '=', locationId)
      .where('t.created_at', '>=', start)
      .where('t.created_at', '<', endExclusive)
      .execute();

    const byItem = new Map<string, { name: string; itemType: string; unitsSold: number; revenue: number }>();
    const categoryTotals = new Map<string, number>();
    for (const item of items) {
      const key = `${item.itemType}:${item.name}`;
      const row = byItem.get(key) ?? { name: item.name, itemType: item.itemType, unitsSold: 0, revenue: 0 };
      row.unitsSold += 1;
      row.revenue += Number(item.price);
      categoryTotals.set(item.itemType, (categoryTotals.get(item.itemType) ?? 0) + Number(item.price));
      byItem.set(key, row);
    }

    const rows = Array.from(byItem.values())
      .map((r) => ({ ...r, pctOfCategory: (categoryTotals.get(r.itemType) ?? 0) > 0 ? Math.round((r.revenue / categoryTotals.get(r.itemType)!) * 1000) / 10 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 25);
    return { rows };
  }

  async run(reportId: ReportId, locationId: string, from?: string, to?: string) {
    switch (reportId) {
      case 'revenue_trend':
        return this.revenueTrend(locationId, from, to);
      case 'revenue_by_staff':
        return this.revenueByStaff(locationId, from, to);
      case 'payment_mix':
        return this.paymentMix(locationId, from, to);
      case 'discount_usage':
        return this.discountUsage(locationId, from, to);
      case 'no_show_trend':
        return this.noShowTrend(locationId, from, to);
      case 'staff_scheduled_hours':
        return this.staffScheduledHours(locationId, from, to);
      case 'compliance_status':
        return this.complianceStatus(locationId);
      case 'top_clients':
        return this.topClients(locationId, from, to);
      case 'new_vs_returning':
        return this.newVsReturning(locationId, from, to);
      case 'top_services_products':
        return this.topServicesAndProducts(locationId, from, to);
      case 'tax_documentation':
        return this.taxDocumentation(locationId);
    }
  }

  async getFavorites(locationStaffId: string) {
    const rows = await db().selectFrom('report_favorites').select(['report_id']).where('location_staff_id', '=', locationStaffId).execute();
    return rows.map((r) => r.report_id);
  }

  async addFavorite(locationStaffId: string, reportId: string) {
    await db()
      .insertInto('report_favorites')
      .values({ location_staff_id: locationStaffId, report_id: reportId })
      .onConflict((oc) => oc.columns(['location_staff_id', 'report_id']).doNothing())
      .execute();
  }

  async removeFavorite(locationStaffId: string, reportId: string) {
    await db().deleteFrom('report_favorites').where('location_staff_id', '=', locationStaffId).where('report_id', '=', reportId).execute();
  }
}
