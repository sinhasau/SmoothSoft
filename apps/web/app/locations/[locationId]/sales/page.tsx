'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { Card, ClickableName } from '../../../../components/ui';

interface SaleRow {
  transactionId: string;
  clientId: string | null;
  clientName: string | null;
  staffId: string | null;
  staffName: string | null;
  serviceTotal: number;
  retailTotal: number;
  tip: string;
  tax: string;
  discountAmount: string;
  total: string;
  paymentMethod: string;
  createdAt: string;
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function SalesPage({ params }: { params: { locationId: string } }) {
  const { data } = useQuery({ queryKey: ['dashboard', 'sales'], queryFn: () => api.get<SaleRow[]>('/dashboard/sales') });

  if (!data) return <p className="text-gray-500">Loading…</p>;

  const totals = data.reduce(
    (acc, r) => ({
      services: acc.services + r.serviceTotal,
      products: acc.products + r.retailTotal,
      discount: acc.discount + Number(r.discountAmount),
      tip: acc.tip + Number(r.tip),
      tax: acc.tax + Number(r.tax),
      total: acc.total + Number(r.total),
    }),
    { services: 0, products: 0, discount: 0, tip: 0, tax: 0, total: 0 },
  );
  // Same figure as the Dashboard's "Revenue" stat card — services + products,
  // net of discounts, before tax and tip. Shown explicitly here because the
  // gross Services/Products columns don't reconcile to Revenue on their own
  // once a discount is involved (that was a real point of confusion: the
  // discount was previously only a small footnote under Total, not visible
  // anywhere as a subtracted line).
  const revenue = totals.services + totals.products - totals.discount;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Today's sales</h2>
        <p className="text-sm text-gray-500">
          {data.length} transaction{data.length === 1 ? '' : 's'} · itemized · Revenue = Services + Products − Discounts
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Barber</th>
              <th className="px-4 py-3 text-right font-medium">Services</th>
              <th className="px-4 py-3 text-right font-medium">Products</th>
              <th className="px-4 py-3 text-right font-medium">Discount</th>
              <th className="px-4 py-3 text-right font-medium">Tip</th>
              <th className="px-4 py-3 text-right font-medium">Tax</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.transactionId} className="border-b border-black/5 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                  {new Date(r.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3">
                  <ClickableName id={r.clientId} name={r.clientName} href={(id) => `/locations/${params.locationId}/clients/${id}`} />
                </td>
                <td className="px-4 py-3">
                  <ClickableName id={r.staffId} name={r.staffName} href={(id) => `/locations/${params.locationId}/staff/${id}`} />
                </td>
                <td className="px-4 py-3 text-right">{money(r.serviceTotal)}</td>
                <td className="px-4 py-3 text-right">{r.retailTotal > 0 ? money(r.retailTotal) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-right text-green-700">
                  {Number(r.discountAmount) > 0 ? `−${money(Number(r.discountAmount))}` : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right">{money(Number(r.tip))}</td>
                <td className="px-4 py-3 text-right">{Number(r.tax) > 0 ? money(Number(r.tax)) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-right font-medium">{money(Number(r.total))}</td>
                <td className="px-4 py-3 capitalize">{r.paymentMethod}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  No sales recorded yet today.
                </td>
              </tr>
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="border-t border-black/10 font-semibold">
                <td className="px-4 py-3" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-3 text-right">{money(totals.services)}</td>
                <td className="px-4 py-3 text-right">{money(totals.products)}</td>
                <td className="px-4 py-3 text-right text-green-700">{totals.discount > 0 ? `−${money(totals.discount)}` : '—'}</td>
                <td className="px-4 py-3 text-right">{money(totals.tip)}</td>
                <td className="px-4 py-3 text-right">{money(totals.tax)}</td>
                <td className="px-4 py-3 text-right">{money(totals.total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {data.length > 0 && (
        <p className="px-1 text-sm text-gray-500">
          Revenue (matches the Dashboard stat card): {money(totals.services)} services + {money(totals.products)} products − {money(totals.discount)}{' '}
          discounts = <span className="font-medium text-black">{money(revenue)}</span>
        </p>
      )}
    </div>
  );
}
