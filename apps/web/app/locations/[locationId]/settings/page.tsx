'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { Button, Card } from '../../../../components/ui';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  stock_qty: number;
}

interface TaxConfig {
  retail_tax_pct: string;
  services_taxable: boolean;
}

interface StaffRosterRow {
  locationStaffId: string;
  fullName: string;
  role: string;
  classification: string;
  schedulingSelfServeOverride: boolean | null;
}

interface DiscountCode {
  id: string;
  code: string;
  discount_type: 'percent' | 'flat';
  value: string;
  active: boolean;
  expires_at: string | null;
  usage_count: number;
}

interface PaymentProcessorConfig {
  starting_cash_float: string;
  card_fee_pct: string;
  active_processor: 'stripe' | 'square' | 'external';
  show_discount_at_checkout: boolean;
}

interface SchedulingPolicy {
  selfServeDefault: boolean;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const services = useQuery({ queryKey: ['settings', 'services'], queryFn: () => api.get<Service[]>('/settings/services') });
  const products = useQuery({ queryKey: ['settings', 'products'], queryFn: () => api.get<Product[]>('/settings/products') });
  const taxConfig = useQuery({ queryKey: ['settings', 'tax-config'], queryFn: () => api.get<TaxConfig>('/settings/tax-config') });
  const roster = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffRosterRow[]>('/settings/staff') });
  const discountCodes = useQuery({ queryKey: ['settings', 'discount-codes'], queryFn: () => api.get<DiscountCode[]>('/settings/discount-codes') });
  const cashConfig = useQuery({ queryKey: ['settings', 'payment-processor-config'], queryFn: () => api.get<PaymentProcessorConfig>('/settings/payment-processor-config') });
  const schedulingPolicy = useQuery({ queryKey: ['settings', 'scheduling-policy'], queryFn: () => api.get<SchedulingPolicy>('/settings/scheduling-policy') });

  const [newService, setNewService] = useState({ name: '', durationMinutes: 20, price: 28 });
  const [newProduct, setNewProduct] = useState({ name: '', price: 15, stockQty: 20 });
  const [newDiscount, setNewDiscount] = useState({ code: '', discountType: 'percent' as 'percent' | 'flat', value: 10 });
  const [discountError, setDiscountError] = useState<string | null>(null);

  const addService = useMutation({
    mutationFn: () => api.post('/settings/services', newService),
    onSuccess: () => {
      setNewService({ name: '', durationMinutes: 20, price: 28 });
      void queryClient.invalidateQueries({ queryKey: ['settings', 'services'] });
    },
  });

  const addProduct = useMutation({
    mutationFn: () => api.post('/settings/products', newProduct),
    onSuccess: () => {
      setNewProduct({ name: '', price: 15, stockQty: 20 });
      void queryClient.invalidateQueries({ queryKey: ['settings', 'products'] });
    },
  });

  const updateTax = useMutation({
    mutationFn: (dto: TaxConfig) => api.put('/settings/tax-config', { retailTaxPct: Number(dto.retail_tax_pct), servicesTaxable: dto.services_taxable }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'tax-config'] }),
  });

  const addDiscount = useMutation({
    mutationFn: () => api.post('/settings/discount-codes', newDiscount),
    onSuccess: () => {
      setNewDiscount({ code: '', discountType: 'percent', value: 10 });
      setDiscountError(null);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'discount-codes'] });
    },
    onError: (err) => setDiscountError(err instanceof ApiError ? (err.body?.message ?? 'Could not add code') : 'Could not add code'),
  });

  const toggleDiscount = useMutation({
    mutationFn: (d: DiscountCode) =>
      api.put(`/settings/discount-codes/${d.id}`, {
        code: d.code,
        discountType: d.discount_type,
        value: Number(d.value),
        active: !d.active,
        expiresAt: d.expires_at,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'discount-codes'] }),
  });

  const removeDiscount = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/discount-codes/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'discount-codes'] }),
  });

  // Partial PUTs — the server merges with the existing row, so each
  // control only sends its own field.
  const updateCashConfig = useMutation({
    mutationFn: (dto: { startingCashFloat?: number; cardFeePct?: number; showDiscountAtCheckout?: boolean }) =>
      api.put('/settings/payment-processor-config', dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'payment-processor-config'] });
      void queryClient.invalidateQueries({ queryKey: ['payments', 'config'] });
    },
  });

  const updateSchedulingPolicy = useMutation({
    mutationFn: (selfServeDefault: boolean) => api.put('/settings/scheduling-policy', { selfServeDefault }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'scheduling-policy'] }),
  });

  const updateStaffOverride = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean | null }) => api.put(`/settings/staff/${id}/scheduling-override`, { selfServeOverride: value }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Services</h2>
        <Card>
          {services.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <span>{s.name}</span>
              <span className="text-gray-500">
                {s.duration_minutes}min · ${Number(s.price).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              className="border border-black/15 rounded-lg px-2 py-1 text-sm flex-1"
              placeholder="New service name"
              value={newService.name}
              onChange={(e) => setNewService({ ...newService, name: e.target.value })}
            />
            <input
              type="number"
              className="border border-black/15 rounded-lg px-2 py-1 text-sm w-20"
              value={newService.durationMinutes}
              onChange={(e) => setNewService({ ...newService, durationMinutes: Number(e.target.value) })}
            />
            <input
              type="number"
              className="border border-black/15 rounded-lg px-2 py-1 text-sm w-20"
              value={newService.price}
              onChange={(e) => setNewService({ ...newService, price: Number(e.target.value) })}
            />
            <Button variant="solid" onClick={() => addService.mutate()} disabled={!newService.name}>
              Add
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Retail products</h2>
        <Card>
          {products.data?.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <span>{p.name}</span>
              <span className="text-gray-500">
                ${Number(p.price).toFixed(2)} · {p.stock_qty} in stock
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              className="border border-black/15 rounded-lg px-2 py-1 text-sm flex-1"
              placeholder="New product name"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            />
            <input
              type="number"
              className="border border-black/15 rounded-lg px-2 py-1 text-sm w-20"
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
            />
            <input
              type="number"
              className="border border-black/15 rounded-lg px-2 py-1 text-sm w-20"
              value={newProduct.stockQty}
              onChange={(e) => setNewProduct({ ...newProduct, stockQty: Number(e.target.value) })}
            />
            <Button variant="solid" onClick={() => addProduct.mutate()} disabled={!newProduct.name}>
              Add
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Sales tax</h2>
        {taxConfig.data && (
          <Card className="p-4 flex items-center gap-4">
            <label className="text-sm">
              Retail tax %
              <input
                type="number"
                className="ml-2 border border-black/15 rounded-lg px-2 py-1 w-20"
                defaultValue={taxConfig.data.retail_tax_pct}
                onBlur={(e) => updateTax.mutate({ ...taxConfig.data!, retail_tax_pct: e.target.value })}
              />
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                defaultChecked={taxConfig.data.services_taxable}
                onChange={(e) => updateTax.mutate({ ...taxConfig.data!, services_taxable: e.target.checked })}
              />
              Services taxable
            </label>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Billing — discount codes</h2>
        <Card>
          {discountCodes.data?.map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <div>
                <span className="font-mono font-medium">{d.code}</span>{' '}
                <span className="text-gray-500">
                  {d.discount_type === 'percent' ? `${Number(d.value)}% off` : `$${Number(d.value).toFixed(2)} off`} · used {d.usage_count}×
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={d.active ? 'text-green-700' : 'text-gray-400'}>{d.active ? 'Active' : 'Inactive'}</span>
                <Button onClick={() => toggleDiscount.mutate(d)}>{d.active ? 'Deactivate' : 'Activate'}</Button>
                <Button onClick={() => removeDiscount.mutate(d.id)}>Delete</Button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              className="border border-black/15 rounded-lg px-2 py-1 text-sm w-28 font-mono uppercase"
              placeholder="CODE"
              value={newDiscount.code}
              onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value })}
            />
            <select
              className="border border-black/15 rounded-lg px-2 py-1 text-sm"
              value={newDiscount.discountType}
              onChange={(e) => setNewDiscount({ ...newDiscount, discountType: e.target.value as 'percent' | 'flat' })}
            >
              <option value="percent">% off</option>
              <option value="flat">$ off</option>
            </select>
            <input
              type="number"
              className="border border-black/15 rounded-lg px-2 py-1 text-sm w-20"
              value={newDiscount.value}
              onChange={(e) => setNewDiscount({ ...newDiscount, value: Number(e.target.value) })}
            />
            <Button variant="solid" onClick={() => addDiscount.mutate()} disabled={!newDiscount.code}>
              Add code
            </Button>
          </div>
          {discountError && <p className="text-red-600 text-sm px-4 pb-3">{discountError}</p>}
          <label className="flex items-center gap-2 border-t border-black/5 px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={cashConfig.data?.show_discount_at_checkout ?? true}
              onChange={(e) => updateCashConfig.mutate({ showDiscountAtCheckout: e.target.checked })}
            />
            Show the discount code field at checkout
          </label>
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Cash drawer & card fees</h2>
        {cashConfig.data && (
          <Card className="p-4 flex items-center gap-6">
            <label className="text-sm">
              Starting drawer float
              <input
                type="number"
                className="ml-2 border border-black/15 rounded-lg px-2 py-1 w-24"
                defaultValue={cashConfig.data.starting_cash_float}
                onBlur={(e) =>
                  updateCashConfig.mutate({ startingCashFloat: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-sm">
              Card processing fee %
              <input
                type="number"
                step="0.1"
                className="ml-2 border border-black/15 rounded-lg px-2 py-1 w-20"
                defaultValue={cashConfig.data.card_fee_pct}
                onBlur={(e) =>
                  updateCashConfig.mutate({ cardFeePct: Number(e.target.value) })
                }
              />
            </label>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Scheduling policy</h2>
        <Card className="p-4 mb-2">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={schedulingPolicy.data?.selfServeDefault ?? false}
              onChange={(e) => updateSchedulingPolicy.mutate(e.target.checked)}
            />
            Employees can set their own schedule directly (default: approval required)
          </label>
        </Card>
        <Card>
          <div className="px-4 py-2 text-xs text-gray-400 border-b border-black/5">Per-staff exceptions to the default above</div>
          {roster.data?.map((r) => (
            <div key={r.locationStaffId} className="flex items-center justify-between border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <span>{r.fullName}</span>
              <select
                className="border border-black/15 rounded-lg px-2 py-1 text-sm"
                value={r.schedulingSelfServeOverride === null ? 'default' : r.schedulingSelfServeOverride ? 'self_serve' : 'approval'}
                onChange={(e) => {
                  const v = e.target.value;
                  updateStaffOverride.mutate({ id: r.locationStaffId, value: v === 'default' ? null : v === 'self_serve' });
                }}
              >
                <option value="default">Use location default</option>
                <option value="self_serve">Self-serve</option>
                <option value="approval">Approval required</option>
              </select>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
