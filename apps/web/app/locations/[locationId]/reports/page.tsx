'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { Button, Card, ClickableName, Pill } from '../../../../components/ui';

type ReportId =
  | 'revenue_trend'
  | 'revenue_by_staff'
  | 'payment_mix'
  | 'discount_usage'
  | 'no_show_trend'
  | 'staff_scheduled_hours'
  | 'compliance_status'
  | 'top_clients'
  | 'new_vs_returning'
  | 'top_services_products'
  | 'tax_documentation';

interface StaffPayRunHistory {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'logged' | 'paid';
  notes: string | null;
  loggedAt: string;
  paidAt: string | null;
  loggedBy: string | null;
  staffCount: number;
  totals: Record<string, number>;
}

interface ReportDef {
  id: ReportId;
  label: string;
  category: 'Sales' | 'Staff & Operations' | 'Clients' | 'Finance & Tax';
  dateRanged: boolean;
  /** Preset day-count buttons offered alongside "Custom". Defaults to [7, 30, 90]. */
  rangeOptions?: number[];
  columns: Column[];
}

const DEFAULT_RANGE_OPTIONS = [7, 30, 90];

interface Column {
  key: string;
  label: string;
  align?: 'right';
  format?: (row: any, locationId: string) => React.ReactNode;
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}
function settlement(value: number | null) {
  if (value == null) return 'Review';
  if (value < 0) return `Owes shop ${money(Math.abs(value))}`;
  return money(value);
}
function dateCell(row: any) {
  return row.date as string;
}

const REPORTS: ReportDef[] = [
  {
    id: 'revenue_trend',
    label: 'Revenue trend',
    category: 'Sales',
    dateRanged: true,
    columns: [
      { key: 'date', label: 'Date', format: dateCell },
      { key: 'services', label: 'Services', align: 'right', format: (r) => money(r.services) },
      { key: 'products', label: 'Products', align: 'right', format: (r) => money(r.products) },
      { key: 'discount', label: 'Discount', align: 'right', format: (r) => (r.discount > 0 ? `−${money(r.discount)}` : '—') },
      { key: 'revenue', label: 'Revenue', align: 'right', format: (r) => money(r.revenue) },
      { key: 'tax', label: 'Tax', align: 'right', format: (r) => money(r.tax) },
      { key: 'tip', label: 'Tip', align: 'right', format: (r) => money(r.tip) },
      { key: 'total', label: 'Total', align: 'right', format: (r) => money(r.total) },
      { key: 'transactions', label: 'Txns', align: 'right' },
    ],
  },
  {
    id: 'revenue_by_staff',
    label: 'Revenue by staff',
    category: 'Sales',
    dateRanged: true,
    rangeOptions: [7, 14, 30],
    columns: [
      { key: 'fullName', label: 'Staff', format: (r, locId) => <ClickableName id={r.locationStaffId} name={r.fullName} href={(id) => `/locations/${locId}/staff/${id}`} /> },
      { key: 'clients', label: 'Clients', align: 'right' },
      { key: 'scheduledHours', label: 'Sched. hrs', align: 'right', format: (r) => Number(r.scheduledHours).toFixed(1) },
      { key: 'netRevenue', label: 'Net revenue', align: 'right', format: (r) => money(r.netRevenue) },
      { key: 'refunds', label: 'Refunds', align: 'right', format: (r) => r.refunds > 0 ? `−${money(r.refunds)}` : '—' },
      { key: 'compensationModel', label: 'Pay model', format: (r) => r.needsConfiguration ? <Pill tone="amber">Needs setup</Pill> : <span className="capitalize">{String(r.compensationModel).replace('_', ' ')}</span> },
      { key: 'basePay', label: 'Base pay', align: 'right', format: (r) => money(r.basePay) },
      { key: 'boothRent', label: 'Rent', align: 'right', format: (r) => r.boothRent > 0 ? `−${money(r.boothRent)}` : '—' },
      { key: 'tipsPayable', label: 'Tips', align: 'right', format: (r) => money(r.tipsPayable) },
      { key: 'estimatedPay', label: 'Est. settlement', align: 'right', format: (r) => settlement(r.estimatedPay) },
    ],
  },
  {
    id: 'payment_mix',
    label: 'Payment method mix',
    category: 'Sales',
    dateRanged: true,
    columns: [
      { key: 'date', label: 'Date', format: dateCell },
      { key: 'cash', label: 'Cash', align: 'right', format: (r) => money(r.cash) },
      { key: 'card', label: 'Card', align: 'right', format: (r) => money(r.card) },
    ],
  },
  {
    id: 'discount_usage',
    label: 'Discount code usage',
    category: 'Sales',
    dateRanged: true,
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'timesUsed', label: 'Times used', align: 'right' },
      { key: 'totalDiscount', label: 'Total discount', align: 'right', format: (r) => money(r.totalDiscount) },
      { key: 'revenueAfterDiscount', label: 'Revenue after discount', align: 'right', format: (r) => money(r.revenueAfterDiscount) },
    ],
  },
  {
    id: 'no_show_trend',
    label: 'No-show / cancel / abandon trend',
    category: 'Staff & Operations',
    dateRanged: true,
    columns: [
      { key: 'date', label: 'Date', format: dateCell },
      { key: 'completed', label: 'Completed', align: 'right' },
      { key: 'noShows', label: 'No-shows', align: 'right' },
      { key: 'cancels', label: 'Cancels', align: 'right' },
      { key: 'abandoned', label: 'Abandoned', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: 'noShowRatePct', label: 'Rate', align: 'right', format: (r) => `${r.noShowRatePct}%` },
    ],
  },
  {
    id: 'staff_scheduled_hours',
    label: 'Staff scheduled hours',
    category: 'Staff & Operations',
    dateRanged: true,
    columns: [
      { key: 'fullName', label: 'Staff', format: (r, locId) => <ClickableName id={r.locationStaffId} name={r.fullName} href={(id) => `/locations/${locId}/staff/${id}`} /> },
      { key: 'scheduledHours', label: 'Scheduled hours', align: 'right' },
    ],
  },
  {
    id: 'compliance_status',
    label: 'Compliance status',
    category: 'Staff & Operations',
    dateRanged: false,
    columns: [
      { key: 'staffName', label: 'Staff', format: (r, locId) => r.locationStaffId ? <ClickableName id={r.locationStaffId} name={r.staffName} href={(id) => `/locations/${locId}/staff/${id}`} /> : r.staffName ?? <span className="text-gray-400">—</span> },
      { key: 'docType', label: 'Document', format: (r) => (r.docType as string).replace(/_/g, ' ') },
      {
        key: 'status',
        label: 'Status',
        format: (r) => (
          <Pill tone={r.status === 'overdue' ? 'red' : r.status === 'needs_attention' ? 'amber' : r.status === 'not_on_file' ? 'gray' : 'green'}>{(r.status as string).replace(/_/g, ' ')}</Pill>
        ),
      },
      { key: 'expiresAt', label: 'Expires', format: (r) => r.expiresAt ?? <span className="text-gray-400">—</span> },
    ],
  },
  {
    id: 'top_clients',
    label: 'Top clients by spend',
    category: 'Clients',
    dateRanged: true,
    columns: [
      { key: 'clientName', label: 'Client', format: (r, locId) => <ClickableName id={r.clientId} name={r.clientName} href={(id) => `/locations/${locId}/clients/${id}`} /> },
      { key: 'visits', label: 'Visits', align: 'right' },
      { key: 'totalSpent', label: 'Total spent', align: 'right', format: (r) => money(r.totalSpent) },
      { key: 'lastVisit', label: 'Last visit', format: (r) => new Date(r.lastVisit).toLocaleDateString() },
    ],
  },
  {
    id: 'new_vs_returning',
    label: 'New vs returning clients',
    category: 'Clients',
    dateRanged: true,
    columns: [
      { key: 'date', label: 'Date', format: dateCell },
      { key: 'newClients', label: 'New', align: 'right' },
      { key: 'returningClients', label: 'Returning', align: 'right' },
    ],
  },
  {
    id: 'top_services_products',
    label: 'Top services & products',
    category: 'Clients',
    dateRanged: true,
    columns: [
      { key: 'name', label: 'Item' },
      { key: 'unitsSold', label: 'Units sold', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right', format: (r) => money(r.revenue) },
      { key: 'pctOfCategory', label: '% of category', align: 'right', format: (r) => `${r.pctOfCategory}%` },
    ],
  },
  {
    id: 'tax_documentation',
    label: 'Tax documentation center',
    category: 'Finance & Tax',
    dateRanged: false,
    columns: [
      { key: 'area', label: 'Area' },
      { key: 'form', label: 'Form / record', format: (row) => <a className="font-medium underline decoration-black/20 underline-offset-2 hover:decoration-black" href={row.officialUrl} target="_blank" rel="noreferrer">{row.form}</a> },
      { key: 'cadence', label: 'Cadence' },
      { key: 'deadline', label: 'Typical deadline' },
      { key: 'readiness', label: 'Available in SmoothSoft', format: (row) => row.readiness === 'supporting_report_ready' ? <Pill tone="green">Supporting data ready</Pill> : <Pill tone="amber">Setup required</Pill> },
      { key: 'detail', label: 'What is needed' },
    ],
  },
];

const CATEGORIES: ReportDef['category'][] = ['Sales', 'Staff & Operations', 'Finance & Tax', 'Clients'];

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
      <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L10 1.5z" strokeLinejoin="round" />
    </svg>
  );
}

export default function ReportsPage({ params }: { params: { locationId: string } }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReportId | null>(null);
  const [rangeMode, setRangeMode] = useState<number | 'custom'>(30);
  const [customFrom, setCustomFrom] = useState(isoDaysAgo(13));
  const [customTo, setCustomTo] = useState(isoDaysAgo(0));
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [payRunNote, setPayRunNote] = useState('');

  const from = rangeMode === 'custom' ? customFrom : isoDaysAgo(rangeMode - 1);
  const to = rangeMode === 'custom' ? customTo : isoDaysAgo(0);

  const favoritesQuery = useQuery({ queryKey: ['reports', 'favorites'], queryFn: () => api.get<string[]>('/reports/favorites') });
  const payrollSettings = useQuery({ queryKey: ['settings', 'payroll-settings'], queryFn: () => api.get<{ scheduleName: string; frequency: string; currentPeriodStart: string; currentPeriodEnd: string; nextPayDate: string }>('/settings/payroll-settings') });
  const favorites = new Set(favoritesQuery.data ?? []);

  const def = selected ? REPORTS.find((r) => r.id === selected) : null;
  const rangeOptions = def?.rangeOptions ?? DEFAULT_RANGE_OPTIONS;

  function selectReport(id: ReportId) {
    setSelected(id);
    if (id === 'revenue_by_staff' && payrollSettings.data) {
      setCustomFrom(payrollSettings.data.currentPeriodStart);
      setCustomTo(payrollSettings.data.currentPeriodEnd);
      setRangeMode('custom');
      return;
    }
    const options = REPORTS.find((r) => r.id === id)?.rangeOptions ?? DEFAULT_RANGE_OPTIONS;
    setRangeMode(options[0]);
  }
  const reportQuery = useQuery({
    queryKey: ['reports', 'data', selected, def?.dateRanged ? from : null, def?.dateRanged ? to : null],
    queryFn: () => api.get<{ rows: any[]; totals?: Record<string, number>; warnings?: string[]; setup?: { label: string; complete: boolean; detail: string }[]; period?: { from: string; to: string } }>(`/reports/${selected}${def?.dateRanged ? `?from=${from}&to=${to}` : ''}`),
    enabled: !!selected,
  });

  const toggleFavorite = useMutation({
    mutationFn: (reportId: ReportId) =>
      favorites.has(reportId) ? api.delete(`/reports/favorites/${reportId}`) : api.put(`/reports/favorites/${reportId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', 'favorites'] }),
  });

  const favoritedReports = useMemo(() => REPORTS.filter((r) => favorites.has(r.id)), [favorites]);

  const payRuns = useQuery({ queryKey: ['reports', 'staff-pay-runs'], queryFn: () => api.get<StaffPayRunHistory[]>('/reports/staff-pay-runs/history'), enabled: selected === 'revenue_by_staff' });
  const logPayRun = useMutation({
    mutationFn: () => api.post('/reports/staff-pay-runs', { from, to, notes: payRunNote || undefined }),
    onSuccess: () => { setPayRunNote(''); queryClient.invalidateQueries({ queryKey: ['reports', 'staff-pay-runs'] }); },
  });

  async function exportPayReport(format: 'pdf' | 'xlsx') {
    setExporting(format);
    try {
      const { blob, filename } = await api.download(`/reports/revenue_by_staff/export/${format}?from=${from}&to=${to}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename ?? `staff-pay-${from}-to-${to}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function exportLoggedPayRun(run: StaffPayRunHistory, format: 'pdf' | 'xlsx') {
    const { blob, filename } = await api.download(`/reports/staff-pay-runs/${run.id}/export/${format}`);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename ?? `logged-staff-pay-${run.periodStart}-to-${run.periodEnd}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Know your business</p>
        <h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Turn daily activity into clear decisions about money, people, and growth.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-5">
        {favoritedReports.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Favorites</h3>
            <ReportList reports={favoritedReports} selected={selected} favorites={favorites} onSelect={selectReport} onToggleFavorite={(id) => toggleFavorite.mutate(id)} />
          </div>
        )}
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{cat}</h3>
            <ReportList
              reports={REPORTS.filter((r) => r.category === cat)}
              selected={selected}
              favorites={favorites}
              onSelect={selectReport}
              onToggleFavorite={(id) => toggleFavorite.mutate(id)}
            />
          </div>
        ))}
      </div>

      <div>
        {!def && <p className="text-gray-500">Choose a report to see its details.</p>}
        {def && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{def.label}</h2>
              <div className="flex flex-wrap items-center gap-2">{selected === 'revenue_by_staff' && <>{payrollSettings.data && <button onClick={() => { setCustomFrom(payrollSettings.data!.currentPeriodStart); setCustomTo(payrollSettings.data!.currentPeriodEnd); setRangeMode('custom'); }} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:border-black/40">Current pay period</button>}<button onClick={() => exportPayReport('pdf')} disabled={!!exporting} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:border-black/40">{exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</button><button onClick={() => exportPayReport('xlsx')} disabled={!!exporting} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:border-black/40">{exporting === 'xlsx' ? 'Preparing…' : 'Download Excel'}</button></>}{def.dateRanged && (
                <div className="flex gap-1">
                  {rangeOptions.map((d) => (
                    <button
                      key={d}
                      onClick={() => setRangeMode(d)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        rangeMode === d ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-ink hover:border-black/30'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                  <button
                    onClick={() => setRangeMode('custom')}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      rangeMode === 'custom' ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-ink hover:border-black/30'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              )}</div>
            </div>

            {def.dateRanged && rangeMode === 'custom' && (
              <div className="flex items-center gap-2 text-sm">
                <input type="date" className="border border-black/15 rounded-lg px-2 py-1" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
                <span className="text-gray-400">to</span>
                <input type="date" className="border border-black/15 rounded-lg px-2 py-1" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            )}

            {reportQuery.isLoading && <p className="text-gray-500">Loading…</p>}
            {reportQuery.data && (
              <>
              {selected === 'tax_documentation' && <><Card className="border-amber-200 bg-amber-50/60 p-4"><h3 className="text-sm font-semibold">W-2 filing requires payroll setup</h3><p className="mt-1 text-xs leading-5 text-gray-600">SmoothSoft can organize employee details, wages, sales, and tips for payroll. Calculating withholding, filing W-2/W-3 forms, and delivering employee copies require a connected payroll provider and completed employer tax profile.</p>{reportQuery.data.warnings?.map((warning) => <p key={warning} className="mt-2 text-xs text-amber-800">• {warning}</p>)}</Card><Card className="p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Tax-center setup</h3><p className="mt-1 text-xs text-gray-500">Finish these items before your first payroll or year-end filing.</p></div><a href={`/locations/${params.locationId}/settings#payroll`} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium">Open payroll settings</a></div><div className="mt-3 divide-y divide-black/5">{reportQuery.data.setup?.map((item) => <div key={item.label} className="flex items-start gap-3 py-3"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${item.complete ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-gray-400'}`}>{item.complete ? '✓' : '○'}</span><div><div className="text-sm font-medium">{item.label}</div><div className="text-xs text-gray-500">{item.detail}</div></div></div>)}</div></Card></>}
              {selected === 'revenue_by_staff' && reportQuery.data.totals && <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Card className="p-4"><div className="text-xs text-gray-500">Net staff revenue</div><div className="mt-1 text-xl font-bold">{money(reportQuery.data.totals.netRevenue)}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Tips tracked</div><div className="mt-1 text-xl font-bold">{money(reportQuery.data.totals.tips)}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Payable to staff</div><div className="mt-1 text-xl font-bold">{money(reportQuery.data.totals.payableToStaff)}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Booth rent due</div><div className="mt-1 text-xl font-bold">{money(reportQuery.data.totals.dueToShop)}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Scheduled hours</div><div className="mt-1 text-xl font-bold">{Number(reportQuery.data.totals.scheduledHours).toFixed(1)}</div></Card></div>}
              {selected === 'top_services_products' ? <div className="grid gap-4 lg:grid-cols-2">{([['service', 'Top services'], ['retail', 'Top retail products']] as const).map(([type, title]) => <div key={type}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3><ReportRowsTable rows={reportQuery.data.rows.filter((row) => row.itemType === type)} columns={def.columns} locationId={params.locationId} /></div>)}</div> : <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-gray-500">
                      {def.columns.map((c) => (
                        <th key={c.key} className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportQuery.data.rows.map((row, i) => (
                      <tr key={i} className="border-b border-black/5 last:border-0">
                        {def.columns.map((c) => (
                          <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                            {c.format ? c.format(row, params.locationId) : (row[c.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {reportQuery.data.rows.length === 0 && (
                      <tr>
                        <td colSpan={def.columns.length} className="px-4 py-8 text-center text-gray-400">
                          No data for this range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>}
              {selected === 'revenue_by_staff' && <PayPeriodReviewCard from={from} to={to} payDate={payrollSettings.data?.nextPayDate} isCurrent={from === payrollSettings.data?.currentPeriodStart && to === payrollSettings.data?.currentPeriodEnd} note={payRunNote} setNote={setPayRunNote} pending={logPayRun.isPending} logged={logPayRun.isSuccess} onLog={() => logPayRun.mutate()} runs={payRuns.data ?? []} onDownload={exportLoggedPayRun} warnings={reportQuery.data.warnings ?? []} />}
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function ReportRowsTable({ rows, columns, locationId }: { rows: Record<string, any>[]; columns: ReportDef['columns']; locationId: string }) {
  return <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-black/10 text-left text-gray-500">{columns.map((column) => <th key={column.key} className={`px-4 py-3 font-medium ${column.align === 'right' ? 'text-right' : ''}`}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-black/5 last:border-0">{columns.map((column) => <td key={column.key} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>{column.format ? column.format(row, locationId) : (row[column.key] ?? '—')}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">No sales in this category for this range.</td></tr>}</tbody></table></Card>;
}

function PayPeriodReviewCard({ from, to, payDate, isCurrent, note, setNote, pending, logged, onLog, runs, onDownload, warnings }: { from: string; to: string; payDate?: string; isCurrent: boolean; note: string; setNote: (value: string) => void; pending: boolean; logged: boolean; onLog: () => void; runs: StaffPayRunHistory[]; onDownload: (run: StaffPayRunHistory, format: 'pdf' | 'xlsx') => Promise<void>; warnings: string[] }) {
  return <div className="space-y-3"><Card className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{isCurrent ? 'Current pay period review' : 'Custom pay period review'}</h3>{isCurrent && <Pill tone="green">Active</Pill>}</div><p className="mt-1 text-xs text-gray-500">{from} through {to}{isCurrent && payDate ? ` · Scheduled payday ${payDate}` : ''}</p></div><span className="text-xs text-gray-400">Logging saves these exact figures</span></div><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Pay period log note" className="min-w-64 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Optional review note or exception…" value={note} onChange={(event) => setNote(event.target.value)} /><Button variant="solid" disabled={pending} onClick={onLog}>{pending ? 'Logging…' : 'Log pay period'}</Button></div>{logged && <p role="status" className="mt-2 text-xs text-green-700">Pay period logged. PDF and Excel copies are available below.</p>}<p className="mt-2 text-xs text-amber-700">{warnings[0]}</p></Card><details className="rounded-xl border border-black/10 bg-white/60"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">Pay period log <span className="text-xs font-normal text-gray-500">{runs.length} saved {runs.length === 1 ? 'period' : 'periods'} · Open history</span></summary><div className="border-t border-black/5">{runs.map((run) => <div key={run.id} className="grid gap-3 border-b border-black/5 px-4 py-3 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="text-sm font-medium">{run.periodStart} – {run.periodEnd}</div><div className="mt-0.5 text-xs text-gray-500">Logged {new Date(run.loggedAt).toLocaleString()}{run.loggedBy ? ` by ${run.loggedBy}` : ''} · {run.staffCount} staff · {money(run.totals.payableToStaff ?? Math.max(run.totals.estimatedPay ?? 0, 0))} payable</div>{run.notes && <div className="mt-1 text-xs text-gray-600">{run.notes}</div>}</div><div className="flex gap-2"><button className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium hover:border-black/40" onClick={() => void onDownload(run, 'pdf')}>PDF</button><button className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium hover:border-black/40" onClick={() => void onDownload(run, 'xlsx')}>Excel</button></div></div>)}{runs.length === 0 && <p className="px-4 py-5 text-sm text-gray-400">No pay periods have been logged yet.</p>}</div></details></div>;
}

function ReportList({
  reports,
  selected,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  reports: ReportDef[];
  selected: ReportId | null;
  favorites: Set<string>;
  onSelect: (id: ReportId) => void;
  onToggleFavorite: (id: ReportId) => void;
}) {
  return (
    <div className="space-y-1">
      {reports.map((r) => (
        <div key={r.id} className={`flex w-full items-center rounded-lg text-sm ${
            selected === r.id ? 'bg-[#315c4f] text-white shadow-sm' : 'hover:bg-[#eef3f0] hover:text-[#244a40]'
          }`}>
          <button type="button" onClick={() => onSelect(r.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
            {r.label}
          </button>
          <button
            type="button"
            aria-label={`${favorites.has(r.id) ? 'Remove' : 'Add'} ${r.label} ${favorites.has(r.id) ? 'from' : 'to'} favorites`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(r.id);
            }}
            className={`mr-1 rounded-md p-2 ${selected === r.id ? 'text-white' : favorites.has(r.id) ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
          >
            <StarIcon filled={favorites.has(r.id)} />
          </button>
        </div>
      ))}
    </div>
  );
}
