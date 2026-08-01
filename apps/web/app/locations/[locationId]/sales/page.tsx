'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { Button, Card, ClickableName, Pill, RowMenu } from '../../../../components/ui';
import { useRequireAuth } from '../../../../lib/auth';

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
  receiptNumber: string | null;
  refundedAmount: number;
  createdAt: string;
  items: { name: string; itemType: string; price: number }[];
  refunds: { id: string; amount: number; reason: string | null; status: string; createdAt: string }[];
}

const money = (value: number) => `$${value.toFixed(2)}`;

export default function SalesPage({ params }: { params: { locationId: string } }) {
  const auth = useRequireAuth();
  const canRefund = auth?.role === 'org_owner' || auth?.role === 'location_manager';
  const queryClient = useQueryClient();
  const [days, setDays] = useState(30);
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const [refundSale, setRefundSale] = useState<SaleRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => crypto.randomUUID());
  const [refundError, setRefundError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['dashboard', 'sales', days], queryFn: () => api.get<SaleRow[]>(`/dashboard/sales?days=${days}`) });
  const refund = useMutation({
    mutationFn: ({ transactionId, amount, reason, idempotencyKey }: { transactionId: string; amount: number; reason: string; idempotencyKey: string }) => api.post(`/payments/transactions/${transactionId}/refund`, { amount, reason, idempotencyKey }),
    onSuccess: () => { setRefundSale(null); setSelectedSale(null); setRefundAmount(''); setRefundReason(''); setRefundError(null); void queryClient.invalidateQueries({ queryKey: ['dashboard', 'sales'] }); },
    onError: (error) => setRefundError(error instanceof ApiError ? error.body?.message ?? 'Refund could not be recorded' : 'Refund could not be recorded'),
  });

  if (!data) return <p className="text-gray-500">Loading…</p>;
  const totals = data.reduce((sum, sale) => ({ services: sum.services + sale.serviceTotal, products: sum.products + sale.retailTotal, discount: sum.discount + Number(sale.discountAmount), total: sum.total + Number(sale.total), refunded: sum.refunded + sale.refundedAmount }), { services: 0, products: 0, discount: 0, total: 0, refunded: 0 });

  function startRefund(sale: SaleRow) {
    if (!canRefund) {
      window.alert('A manager must approve and issue refunds.');
      return;
    }
    setRefundSale(sale);
    setRefundAmount((Number(sale.total) - sale.refundedAmount).toFixed(2));
    setRefundReason('');
    setRefundIdempotencyKey(crypto.randomUUID());
    setRefundError(null);
  }

  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Money in motion</p><h1 className="text-3xl font-semibold tracking-tight">Sales log</h1><p className="mt-1 text-sm text-gray-500">Open a receipt to review the original sale, print it, or issue a full or partial refund.</p></div><div className="flex rounded-xl bg-stone-100 p-1">{[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([value, label]) => <button key={value} className={`rounded-lg px-3 py-1.5 text-sm ${days === value ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`} onClick={() => setDays(Number(value))}>{label}</button>)}</div></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Card className="p-4"><div className="text-xs text-gray-500">Sales</div><div className="mt-1 text-xl font-semibold">{data.length}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Collected</div><div className="mt-1 text-xl font-semibold">{money(totals.total)}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Refunded</div><div className="mt-1 text-xl font-semibold">{money(totals.refunded)}</div></Card><Card className="p-4"><div className="text-xs text-gray-500">Net after refunds</div><div className="mt-1 text-xl font-semibold">{money(totals.total - totals.refunded)}</div></Card></div><Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b border-black/10 text-left text-gray-500"><th className="px-4 py-3 font-medium">Sale</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Professional</th><th className="px-4 py-3 text-right font-medium">Services</th><th className="px-4 py-3 text-right font-medium">Products</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th><th className="w-10" /></tr></thead><tbody>{data.map((sale) => { const remaining = Number(sale.total) - sale.refundedAmount; return <tr key={sale.transactionId} className="border-b border-black/5 last:border-0"><td className="px-4 py-3"><button className="text-left font-medium underline decoration-dotted decoration-gray-400 underline-offset-2" onClick={() => setSelectedSale(sale)}>{sale.receiptNumber ?? 'Legacy sale'}</button><div className="mt-0.5 text-[11px] text-gray-400">{new Date(sale.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></td><td className="px-4 py-3"><ClickableName id={sale.clientId} name={sale.clientName} href={(id) => `/locations/${params.locationId}/clients/${id}`} /></td><td className="px-4 py-3"><ClickableName id={sale.staffId} name={sale.staffName} href={(id) => `/locations/${params.locationId}/staff/${id}`} /></td><td className="px-4 py-3 text-right">{money(sale.serviceTotal)}</td><td className="px-4 py-3 text-right">{sale.retailTotal ? money(sale.retailTotal) : '—'}</td><td className="px-4 py-3 text-right font-medium">{money(Number(sale.total))}</td><td className="px-4 py-3">{remaining <= 0 ? <Pill tone="gray">Fully refunded</Pill> : sale.refundedAmount > 0 ? <Pill tone="amber">Partially refunded</Pill> : <Pill tone="green">Completed</Pill>}<div className="mt-1 text-[11px] capitalize text-gray-400">{sale.paymentMethod}</div></td><td><RowMenu items={[{ label: 'View receipt', onClick: () => setSelectedSale(sale) }, { label: 'Refund sale', destructive: true, hidden: remaining <= 0, onClick: () => startRefund(sale) }]} /></td></tr>; })}{data.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No sales in this period.</td></tr>}</tbody></table></Card>{selectedSale && <SaleReceipt sale={selectedSale} onClose={() => setSelectedSale(null)} onRefund={() => startRefund(selectedSale)} />}{refundSale && <RefundDialog sale={refundSale} amount={refundAmount} reason={refundReason} error={refundError} pending={refund.isPending} setAmount={setRefundAmount} setReason={setRefundReason} onClose={() => setRefundSale(null)} onSubmit={() => refund.mutate({ transactionId: refundSale.transactionId, amount: Number(refundAmount), reason: refundReason, idempotencyKey: refundIdempotencyKey })} />}</div>;
}

function SaleReceipt({ sale, onClose, onRefund }: { sale: SaleRow; onClose: () => void; onRefund: () => void }) {
  const remaining = Number(sale.total) - sale.refundedAmount;
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/35 p-4" onMouseDown={onClose}><div className="receipt-print my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between border-b border-black/10 px-5 py-4"><div><h2 className="font-semibold">Sale receipt</h2><p className="text-xs text-gray-500">{sale.receiptNumber ?? sale.transactionId}</p></div><button aria-label="Close sale receipt" className="text-xl text-gray-400" onClick={onClose}>×</button></div><div className="space-y-4 p-5 text-sm"><div className="flex justify-between text-xs text-gray-500"><span>{new Date(sale.createdAt).toLocaleString()}</span><span className="capitalize">{sale.paymentMethod}</span></div><div className="divide-y divide-black/5">{sale.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between py-2"><span>{item.name}<span className="ml-2 text-xs capitalize text-gray-400">{item.itemType}</span></span><span>{money(item.price)}</span></div>)}</div><div className="space-y-1 border-t border-black/10 pt-3"><div className="flex justify-between"><span>Discount</span><span>{Number(sale.discountAmount) ? `−${money(Number(sale.discountAmount))}` : '—'}</span></div><div className="flex justify-between"><span>Tax</span><span>{money(Number(sale.tax))}</span></div><div className="flex justify-between"><span>Tip</span><span>{money(Number(sale.tip))}</span></div><div className="flex justify-between pt-1 font-semibold"><span>Total</span><span>{money(Number(sale.total))}</span></div></div>{sale.refunds.length > 0 && <div className="rounded-xl bg-amber-50 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Refund history</h3>{sale.refunds.map((refund) => <div key={refund.id} className="mt-2 flex justify-between text-xs"><span>{refund.reason ?? 'Refund'} · {new Date(refund.createdAt).toLocaleDateString()}</span><span>−{money(refund.amount)}</span></div>)}</div>}</div><div className="flex justify-end gap-2 border-t border-black/10 px-5 py-4 print:hidden"><Button onClick={() => window.print()}>Print receipt</Button>{remaining > 0 && <Button variant="solid" onClick={onRefund}>Refund sale</Button>}</div></div></div>;
}

function RefundDialog({ sale, amount, reason, error, pending, setAmount, setReason, onClose, onSubmit }: { sale: SaleRow; amount: string; reason: string; error: string | null; pending: boolean; setAmount: (value: string) => void; setReason: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const remaining = Number(sale.total) - sale.refundedAmount;
  const valid = Number(amount) > 0 && Number(amount) <= remaining && reason.trim().length > 0;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-4" onMouseDown={onClose}><div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-lg font-semibold">Refund sale</h2><p className="mt-1 text-sm text-gray-500">{sale.receiptNumber ?? 'Legacy sale'} · {money(remaining)} remaining refundable</p>{sale.paymentMethod === 'card' && <p className="mt-3 rounded-lg bg-[#eef4f1] px-3 py-2 text-xs text-[#315c4f]">The refund will be sent to the original card through the payment partner used for this sale.</p>}<div className="mt-4 space-y-3"><label className="block text-sm">Refund amount<input aria-label="Refund amount" type="number" min="0.01" max={remaining} step="0.01" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="block text-sm">Reason<input aria-label="Refund reason" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" placeholder="Duplicate charge, wrong item…" value={reason} onChange={(event) => setReason(event.target.value)} /></label></div>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="solid" disabled={!valid || pending} onClick={onSubmit}>{pending ? 'Refunding…' : `Refund ${money(Number(amount) || 0)}`}</Button></div></div></div>;
}
