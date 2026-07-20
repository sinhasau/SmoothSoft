import { Injectable } from '@nestjs/common';
import { db } from '../common/request-context';

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
    const { start, endExclusive } = parseRange(from, to);

    const roster = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select(['ls.id as locationStaffId', 'u.full_name as fullName'])
      .where('ls.location_id', '=', locationId)
      .execute();

    const txns = await trx
      .selectFrom('transactions')
      .select(['id', 'location_staff_id', 'tip', 'total'])
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

    const byStaff = new Map(
      roster.map((s) => [s.locationStaffId, { locationStaffId: s.locationStaffId, fullName: s.fullName, clients: 0, services: 0, products: 0, tips: 0, total: 0 }]),
    );
    for (const t of txns) {
      if (!t.location_staff_id) continue;
      const row = byStaff.get(t.location_staff_id);
      if (!row) continue;
      row.clients += 1;
      row.services += serviceByTxn.get(t.id) ?? 0;
      row.products += retailByTxn.get(t.id) ?? 0;
      row.tips += Number(t.tip);
      row.total += Number(t.total);
    }

    const rows = Array.from(byStaff.values()).sort((a, b) => b.total - a.total);
    return { rows };
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
    const rows = await trx
      .selectFrom('compliance_documents as cd')
      .leftJoin('location_staff as ls', 'ls.id', 'cd.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select(['cd.id as id', 'cd.doc_type as docType', 'cd.description as description', 'cd.expires_at as expiresAt', 'cd.status as status', 'u.full_name as staffName'])
      .where('cd.location_id', '=', locationId)
      .orderBy((eb) => eb.case().when('cd.status', '=', 'overdue').then(0).when('cd.status', '=', 'needs_attention').then(1).else(2).end())
      .orderBy('cd.expires_at', 'asc')
      .execute();
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
    let grandTotal = 0;
    for (const item of items) {
      const key = `${item.itemType}:${item.name}`;
      const row = byItem.get(key) ?? { name: item.name, itemType: item.itemType, unitsSold: 0, revenue: 0 };
      row.unitsSold += 1;
      row.revenue += Number(item.price);
      grandTotal += Number(item.price);
      byItem.set(key, row);
    }

    const rows = Array.from(byItem.values())
      .map((r) => ({ ...r, pctOfTotal: grandTotal > 0 ? Math.round((r.revenue / grandTotal) * 1000) / 10 : 0 }))
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
