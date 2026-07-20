'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { Card, ClickableName, Pill } from '../../../../components/ui';

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
  | 'top_services_products';

interface ReportDef {
  id: ReportId;
  label: string;
  category: 'Sales' | 'Staff & Operations' | 'Clients';
  dateRanged: boolean;
  columns: Column[];
}

interface Column {
  key: string;
  label: string;
  align?: 'right';
  format?: (row: any, locationId: string) => React.ReactNode;
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
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
    columns: [
      { key: 'fullName', label: 'Staff', format: (r, locId) => <ClickableName id={r.locationStaffId} name={r.fullName} href={(id) => `/locations/${locId}/staff/${id}`} /> },
      { key: 'clients', label: 'Clients', align: 'right' },
      { key: 'services', label: 'Services', align: 'right', format: (r) => money(r.services) },
      { key: 'products', label: 'Products', align: 'right', format: (r) => money(r.products) },
      { key: 'tips', label: 'Tips', align: 'right', format: (r) => money(r.tips) },
      { key: 'total', label: 'Total', align: 'right', format: (r) => money(r.total) },
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
      { key: 'staffName', label: 'Staff', format: (r) => r.staffName ?? <span className="text-gray-400">—</span> },
      { key: 'docType', label: 'Document', format: (r) => (r.docType as string).replace(/_/g, ' ') },
      {
        key: 'status',
        label: 'Status',
        format: (r) => (
          <Pill tone={r.status === 'overdue' ? 'red' : r.status === 'needs_attention' ? 'amber' : 'green'}>{(r.status as string).replace(/_/g, ' ')}</Pill>
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
      { key: 'itemType', label: 'Type', format: (r) => <span className="capitalize">{r.itemType}</span> },
      { key: 'unitsSold', label: 'Units sold', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right', format: (r) => money(r.revenue) },
      { key: 'pctOfTotal', label: '% of total', align: 'right', format: (r) => `${r.pctOfTotal}%` },
    ],
  },
];

const CATEGORIES: ReportDef['category'][] = ['Sales', 'Staff & Operations', 'Clients'];

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
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);

  const from = isoDaysAgo(rangeDays - 1);
  const to = isoDaysAgo(0);

  const favoritesQuery = useQuery({ queryKey: ['reports', 'favorites'], queryFn: () => api.get<string[]>('/reports/favorites') });
  const favorites = new Set(favoritesQuery.data ?? []);

  const def = selected ? REPORTS.find((r) => r.id === selected) : null;
  const reportQuery = useQuery({
    queryKey: ['reports', 'data', selected, def?.dateRanged ? from : null, def?.dateRanged ? to : null],
    queryFn: () => api.get<{ rows: any[]; totals?: Record<string, number> }>(`/reports/${selected}${def?.dateRanged ? `?from=${from}&to=${to}` : ''}`),
    enabled: !!selected,
  });

  const toggleFavorite = useMutation({
    mutationFn: (reportId: ReportId) =>
      favorites.has(reportId) ? api.delete(`/reports/favorites/${reportId}`) : api.put(`/reports/favorites/${reportId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', 'favorites'] }),
  });

  const favoritedReports = useMemo(() => REPORTS.filter((r) => favorites.has(r.id)), [favorites]);

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      <div className="space-y-5">
        {favoritedReports.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Favorites</h3>
            <ReportList reports={favoritedReports} selected={selected} favorites={favorites} onSelect={setSelected} onToggleFavorite={(id) => toggleFavorite.mutate(id)} />
          </div>
        )}
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{cat}</h3>
            <ReportList
              reports={REPORTS.filter((r) => r.category === cat)}
              selected={selected}
              favorites={favorites}
              onSelect={setSelected}
              onToggleFavorite={(id) => toggleFavorite.mutate(id)}
            />
          </div>
        ))}
      </div>

      <div>
        {!def && <p className="text-gray-500">Select a report from the left to view it.</p>}
        {def && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{def.label}</h2>
              {def.dateRanged && (
                <div className="flex gap-1">
                  {([7, 30, 90] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setRangeDays(d)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        rangeDays === d ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-ink hover:border-black/30'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              )}
            </div>

            {reportQuery.isLoading && <p className="text-gray-500">Loading…</p>}
            {reportQuery.data && (
              <Card className="overflow-x-auto">
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
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
            selected === r.id ? 'bg-black text-white' : 'hover:bg-black/5'
          }`}
        >
          <span>{r.label}</span>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(r.id);
            }}
            className={selected === r.id ? 'text-white' : favorites.has(r.id) ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}
          >
            <StarIcon filled={favorites.has(r.id)} />
          </span>
        </button>
      ))}
    </div>
  );
}
