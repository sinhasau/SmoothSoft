'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../../lib/api';
import { Button, Card, Pill } from '../../../../components/ui';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: string;
  is_default: boolean;
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
  priceTierAmount: string;
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
  stripe_publishable_key: string | null;
  stripe_connected_account_id: string | null;
  square_application_id: string | null;
  square_location_id: string | null;
}

interface SchedulingPolicy {
  selfServeDefault: boolean;
  overtimeThresholdHours: number;
  minimumCoverage: number;
  chairCount: number;
  baseHourlyLaborCost: number;
  payrollBurdenPct: number;
}

interface FeatureSettings { retailProductsEnabled: boolean; discountCodesEnabled: boolean }
interface MatchingPolicy { continuityWeight: number }

interface CommunicationSettings { enabled: boolean; bookingConfirmations: boolean; appointmentReminders: boolean }
interface SanitationSettings { enabled: boolean; intervalHours: number; nextDueAt: string | null; due: boolean; snoozed: boolean; lastCompletedAt: string | null }
interface PayrollSettings { scheduleName: string; frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'; anchorDate: string; workweekStartsOn: number; paydayOffsetBusinessDays: number; currentPeriodStart: string; currentPeriodEnd: string; nextPayDate: string; upcomingPeriods: { periodStart: string; periodEnd: string; payDate: string }[] }
interface PayModel { id: string; name: string; calculation_type: 'commission' | 'booth_rent' | 'hourly' | 'salary'; default_amount: string }
interface JobRole { id: string; name: string; permission_role: 'location_manager' | 'staff' | 'front_desk' }

interface StoreHoursDay {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
}
interface SpecialHours { id: string; date: string; label: string | null; isClosed: boolean; openTime: string | null; closeTime: string | null }

interface PricingPolicy {
  barberRequestMode: 'same' | 'per_staff' | 'flat';
  flatSurchargeAmount: number;
  creditSurchargeToStaff: boolean;
}

interface ComplianceDocument {
  id: string;
  docType: string;
  description: string | null;
  expiresAt: string | null;
  status: 'valid' | 'needs_attention' | 'overdue';
  locationStaffId: string | null;
  staffName: string | null;
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
  const storeHours = useQuery({ queryKey: ['settings', 'store-hours'], queryFn: () => api.get<StoreHoursDay[]>('/settings/store-hours') });
  const specialHours = useQuery({ queryKey: ['settings', 'special-hours'], queryFn: () => api.get<SpecialHours[]>('/settings/special-hours') });
  const communicationSettings = useQuery({ queryKey: ['settings', 'communication-settings'], queryFn: () => api.get<CommunicationSettings>('/settings/communication-settings') });
  const complianceDocs = useQuery({ queryKey: ['settings', 'compliance-documents'], queryFn: () => api.get<ComplianceDocument[]>('/settings/compliance-documents') });
  const pricingPolicy = useQuery({ queryKey: ['settings', 'pricing-policy'], queryFn: () => api.get<PricingPolicy>('/settings/pricing-policy') });
  const featureSettings = useQuery({ queryKey: ['settings', 'feature-settings'], queryFn: () => api.get<FeatureSettings>('/settings/feature-settings') });
  const sanitationSettings = useQuery({ queryKey: ['settings', 'sanitation-reminders'], queryFn: () => api.get<SanitationSettings>('/settings/sanitation-reminders') });
  const payrollSettings = useQuery({ queryKey: ['settings', 'payroll-settings'], queryFn: () => api.get<PayrollSettings>('/settings/payroll-settings') });
  const payModels = useQuery({ queryKey: ['settings', 'pay-models'], queryFn: () => api.get<PayModel[]>('/settings/pay-models') });
  const jobRoles = useQuery({ queryKey: ['settings', 'job-roles'], queryFn: () => api.get<JobRole[]>('/settings/job-roles') });
  const matchingPolicy = useQuery({ queryKey: ['settings', 'matching-policy'], queryFn: () => api.get<MatchingPolicy>('/settings/matching-policy') });

  const [newService, setNewService] = useState({ name: '', durationMinutes: 20, price: 28 });
  const [newProduct, setNewProduct] = useState({ name: '', price: 15, stockQty: 20 });
  const [editingService, setEditingService] = useState<{ id: string; name: string; durationMinutes: number; price: number } | null>(null);
  const [editingProduct, setEditingProduct] = useState<{ id: string; name: string; price: number; stockQty: number } | null>(null);
  const [newDiscount, setNewDiscount] = useState({ code: '', discountType: 'percent' as 'percent' | 'flat', value: 10 });
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [newSpecialHours, setNewSpecialHours] = useState({ date: '', label: '', isClosed: true, openTime: '09:00', closeTime: '18:00' });
  const [settingsView, setSettingsView] = useState<'regular' | 'advanced'>('regular');
  const [newPayModel, setNewPayModel] = useState({ name: '', calculationType: 'hourly' as PayModel['calculation_type'], defaultAmount: 20 });
  const [newJobRole, setNewJobRole] = useState({ name: '', permissionRole: 'staff' as JobRole['permission_role'] });

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
  const updateService = useMutation({ mutationFn: (value: NonNullable<typeof editingService>) => api.put(`/settings/services/${value.id}`, value), onSuccess: () => { setEditingService(null); void queryClient.invalidateQueries({ queryKey: ['settings', 'services'] }); } });
  const removeService = useMutation({ mutationFn: (id: string) => api.delete(`/settings/services/${id}`), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'services'] }) });
  // The default service pre-fills check-in, new appointments, and rebooking across the app
  // (see resolveDefaultServiceIds on the API) — surfaced here since it used to be an invisible
  // "whichever service is named Haircut" convention.
  const setDefaultService = useMutation({ mutationFn: (id: string) => api.post(`/settings/services/${id}/set-default`, {}), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'services'] }) });
  const updateProduct = useMutation({ mutationFn: (value: NonNullable<typeof editingProduct>) => api.put(`/settings/products/${value.id}`, value), onSuccess: () => { setEditingProduct(null); void queryClient.invalidateQueries({ queryKey: ['settings', 'products'] }); } });
  const removeProduct = useMutation({ mutationFn: (id: string) => api.delete(`/settings/products/${id}`), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'products'] }) });

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
    mutationFn: (dto: { activeProcessor?: 'stripe' | 'square' | 'external'; startingCashFloat?: number; cardFeePct?: number; showDiscountAtCheckout?: boolean; stripePublishableKey?: string | null; stripeConnectedAccountId?: string | null; squareApplicationId?: string | null; squareLocationId?: string | null }) =>
      api.put('/settings/payment-processor-config', dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'payment-processor-config'] });
      void queryClient.invalidateQueries({ queryKey: ['payments', 'config'] });
    },
  });

  const updateSchedulingPolicy = useMutation({
    mutationFn: (dto: Partial<SchedulingPolicy>) => api.put('/settings/scheduling-policy', dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'scheduling-policy'] }),
  });
  const updateFeatureSettings = useMutation({
    mutationFn: (dto: Partial<FeatureSettings>) => api.put('/settings/feature-settings', dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'feature-settings'] }),
  });
  const updateMatchingPolicy = useMutation({
    mutationFn: (continuityWeight: number) => api.put('/settings/matching-policy', { continuityWeight }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'matching-policy'] });
      void queryClient.invalidateQueries({ queryKey: ['queue', 'board'] });
    },
  });

  const updateStoreHours = useMutation({
    mutationFn: (days: StoreHoursDay[]) => api.put('/settings/store-hours', days.map((day) => ({ dayOfWeek: day.day_of_week, isOpen: day.is_open, openTime: day.open_time, closeTime: day.close_time }))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'store-hours'] });
      void queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
  const addSpecialHours = useMutation({ mutationFn: () => api.post('/settings/special-hours', newSpecialHours), onSuccess: () => { setNewSpecialHours({ date: '', label: '', isClosed: true, openTime: '09:00', closeTime: '18:00' }); void queryClient.invalidateQueries({ queryKey: ['settings', 'special-hours'] }); void queryClient.invalidateQueries({ queryKey: ['schedule'] }); } });
  const removeSpecialHours = useMutation({ mutationFn: (id: string) => api.delete(`/settings/special-hours/${id}`), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['settings', 'special-hours'] }); void queryClient.invalidateQueries({ queryKey: ['schedule'] }); } });
  const updateCommunicationSettings = useMutation({
    mutationFn: (dto: Partial<CommunicationSettings>) => api.put('/settings/communication-settings', dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'communication-settings'] }),
  });
  const updateSanitationSettings = useMutation({
    mutationFn: (dto: Partial<Pick<SanitationSettings, 'enabled' | 'intervalHours'>>) => api.put('/settings/sanitation-reminders', dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'sanitation-reminders'] }),
  });
  const updatePayrollSettings = useMutation({
    mutationFn: (dto: Pick<PayrollSettings, 'scheduleName' | 'frequency' | 'anchorDate' | 'workweekStartsOn' | 'paydayOffsetBusinessDays'>) => api.put('/settings/payroll-settings', dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'payroll-settings'] }),
  });
  const addPayModel = useMutation({ mutationFn: () => api.post('/settings/pay-models', newPayModel), onSuccess: () => { setNewPayModel({ name: '', calculationType: 'hourly', defaultAmount: 20 }); void queryClient.invalidateQueries({ queryKey: ['settings', 'pay-models'] }); } });
  const removePayModel = useMutation({ mutationFn: (id: string) => api.delete(`/settings/pay-models/${id}`), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'pay-models'] }) });
  const addJobRole = useMutation({ mutationFn: () => api.post('/settings/job-roles', newJobRole), onSuccess: () => { setNewJobRole({ name: '', permissionRole: 'staff' }); void queryClient.invalidateQueries({ queryKey: ['settings', 'job-roles'] }); } });
  const removeJobRole = useMutation({ mutationFn: (id: string) => api.delete(`/settings/job-roles/${id}`), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'job-roles'] }) });

  const updateStaffOverride = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean | null }) => api.put(`/settings/staff/${id}/scheduling-override`, { selfServeOverride: value }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });

  const updatePricingPolicy = useMutation({
    mutationFn: (dto: PricingPolicy) => api.put('/settings/pricing-policy', dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'pricing-policy'] }),
  });

  const updateStaffPriceTier = useMutation({
    mutationFn: ({ id, priceTierAmount }: { id: string; priceTierAmount: number }) => api.put(`/settings/staff/${id}/price-tier`, { priceTierAmount }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });

  const updateComplianceDoc = useMutation({
    mutationFn: ({ id, ...dto }: { id: string; status?: ComplianceDocument['status']; expiresAt?: string | null }) =>
      api.put(`/settings/compliance-documents/${id}`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'compliance-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'location'] });
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Make it yours</p>
        <h1 className="font-serif text-4xl font-medium tracking-tight text-[#171d1a]">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Shape how this location operates, communicates, and gets paid.</p>
      </header>
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Quick access</h2>
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-black/5 sm:grid-cols-5">
          {[{ label: 'Services', id: 'services' }, { label: 'Store hours', id: 'store-hours' }, { label: 'Special dates', id: 'special-hours' }].map((item) => <button type="button" key={item.id} className="bg-white px-3 py-3 text-center text-sm font-medium hover:bg-stone-50" onClick={() => { setSettingsView('regular'); window.setTimeout(() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' }), 0); }}>{item.label}</button>)}<button type="button" className="bg-white px-3 py-3 text-center text-sm font-medium hover:bg-stone-50" onClick={() => { setSettingsView('advanced'); window.setTimeout(() => document.getElementById('payments')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Payments</button><button type="button" className="bg-white px-3 py-3 text-center text-sm font-medium hover:bg-stone-50" onClick={() => { setSettingsView('advanced'); window.setTimeout(() => document.getElementById('scheduling')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>Scheduling</button>
        </Card>
      </div>
      <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1"><button type="button" onClick={() => setSettingsView('regular')} className={`rounded-lg px-3 py-2 text-sm font-medium ${settingsView === 'regular' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Regular</button><button type="button" onClick={() => setSettingsView('advanced')} className={`rounded-lg px-3 py-2 text-sm font-medium ${settingsView === 'advanced' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Advanced</button></div>
      <div className="border-b border-black/10 pb-2"><h2 className="text-sm font-semibold">{settingsView === 'regular' ? 'Regular settings' : 'Advanced settings'}</h2><p className="text-xs text-gray-500">{settingsView === 'regular' ? 'Settings you may adjust as the shop changes.' : 'Payroll, payments, policies, and other setup that rarely changes.'}</p></div>
      {settingsView === 'regular' && <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Feature controls</h2>
        <Card className="divide-y divide-black/5">
          <p className="px-4 py-3 text-xs text-gray-500">Show only the tools this location uses. Turning one off hides its settings and checkout options without deleting its data.</p>
          {[
            { label: 'Retail products', detail: 'Inventory and product checkout', checked: featureSettings.data?.retailProductsEnabled ?? true, change: (checked: boolean) => updateFeatureSettings.mutate({ retailProductsEnabled: checked }) },
            { label: 'Discount codes', detail: 'Promotional codes at checkout', checked: featureSettings.data?.discountCodesEnabled ?? true, change: (checked: boolean) => updateFeatureSettings.mutate({ discountCodesEnabled: checked }) },
            { label: 'Barber request pricing', detail: 'Premium pricing for a requested professional', checked: pricingPolicy.data?.barberRequestMode !== 'same', change: (checked: boolean) => pricingPolicy.data && updatePricingPolicy.mutate({ ...pricingPolicy.data, barberRequestMode: checked ? 'flat' : 'same' }) },
            { label: 'Customer messaging & notifications', detail: 'Booking confirmations and reminders', checked: communicationSettings.data?.enabled ?? true, change: (checked: boolean) => updateCommunicationSettings.mutate({ enabled: checked }) },
            { label: 'Sanitation reminders', detail: 'Prompt staff to disinfect tools and work areas', checked: sanitationSettings.data?.enabled ?? false, change: (checked: boolean) => updateSanitationSettings.mutate({ enabled: checked }) },
          ].map((item) => <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-3"><span><strong className="block text-sm font-medium">{item.label}</strong><span className="text-xs text-gray-500">{item.detail}</span></span><button type="button" role="switch" aria-checked={item.checked} aria-label={`${item.label}: ${item.checked ? 'on' : 'off'}`} onClick={() => item.change(!item.checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${item.checked ? 'bg-black' : 'bg-gray-200'}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${item.checked ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>)}
        </Card>
        {matchingPolicy.data && <BestMatchCard settings={matchingPolicy.data} pending={updateMatchingPolicy.isPending} onSave={(value) => updateMatchingPolicy.mutate(value)} />}
        {sanitationSettings.data?.enabled && <Card className="mt-3 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Sanitation check cadence</p><p className="mt-1 text-xs text-gray-500">Reminders appear on Today for clocked-in staff. They can mark the check complete or snooze it for 10 minutes.</p></div><label className="shrink-0 text-xs font-medium text-gray-500">Remind every<select aria-label="Sanitation reminder interval" className="ml-2 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm text-black" value={sanitationSettings.data.intervalHours} onChange={(event) => updateSanitationSettings.mutate({ intervalHours: Number(event.target.value) })}>{[1, 2, 3, 4, 6, 8].map((hours) => <option key={hours} value={hours}>{hours} {hours === 1 ? 'hour' : 'hours'}</option>)}</select></label></div></Card>}
      </div>}
      {settingsView === 'advanced' && <div id="compliance">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Compliance documents</h2>
        <Card>
          <p className="border-b border-black/5 px-4 py-3 text-xs text-gray-500">Add licenses and supporting files on each employee profile. Use this overview to spot upcoming renewals and missing documents.</p>
          {complianceDocs.data?.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No compliance documents on file.</p>}
          {complianceDocs.data?.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-4 border-b border-black/5 last:border-0 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">
                  {d.docType.replace(/_/g, ' ')}
                  {d.staffName ? ` · ${d.staffName}` : ''}
                </div>
                {d.description && <div className="text-gray-500">{d.description}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Pill tone={d.status === 'overdue' ? 'red' : d.status === 'needs_attention' ? 'amber' : 'green'}>{d.status.replace(/_/g, ' ')}</Pill>
                <input
                  type="date"
                  className="border border-black/15 rounded-lg px-2 py-1 text-sm"
                  defaultValue={d.expiresAt ?? ''}
                  onBlur={(e) => updateComplianceDoc.mutate({ id: d.id, expiresAt: e.target.value || null })}
                />
                {d.status !== 'valid' && (
                  <Button onClick={() => updateComplianceDoc.mutate({ id: d.id, status: 'valid' })}>Mark valid</Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>}

      {settingsView === 'regular' && <div id="services">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Services</h2>
        <Card>
          {services.data?.map((s) => (
            editingService?.id === s.id ? <div key={s.id} className="grid gap-2 border-b border-black/5 px-4 py-3 sm:grid-cols-[1fr_7rem_7rem_auto]"><input aria-label="Service name" className="rounded-lg border border-black/15 px-2 py-1.5 text-sm" value={editingService.name} onChange={(event) => setEditingService({ ...editingService, name: event.target.value })} /><label className="text-[11px] text-gray-500">Duration (minutes)<input aria-label="Service duration in minutes" type="number" min="1" className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-sm text-black" value={editingService.durationMinutes} onChange={(event) => setEditingService({ ...editingService, durationMinutes: Number(event.target.value) })} /></label><label className="text-[11px] text-gray-500">Price<input aria-label="Service price" type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-sm text-black" value={editingService.price} onChange={(event) => setEditingService({ ...editingService, price: Number(event.target.value) })} /></label><div className="flex items-end gap-1"><Button variant="solid" onClick={() => updateService.mutate(editingService)}>Save</Button><Button onClick={() => setEditingService(null)}>Cancel</Button></div></div> : <div key={s.id} className="flex items-center justify-between gap-3 border-b border-black/5 last:border-0 px-4 py-3 text-sm"><span>{s.name}</span>{s.is_default ? <Pill tone="green">Default</Pill> : <button className="text-xs text-gray-400 underline hover:text-black" disabled={setDefaultService.isPending} onClick={() => setDefaultService.mutate(s.id)}>Set as default</button>}<span className="ml-auto text-gray-500">{s.duration_minutes} min · ${Number(s.price).toFixed(2)}</span><Button onClick={() => setEditingService({ id: s.id, name: s.name, durationMinutes: s.duration_minutes, price: Number(s.price) })}>Edit</Button><button className="text-xs text-gray-400 hover:text-red-600" onClick={() => { if (window.confirm(`Remove ${s.name}?`)) removeService.mutate(s.id); }}>Delete</button></div>
          ))}
          <p className="px-4 pb-2 text-xs text-gray-400">The default service pre-fills check-in, new appointments, and rebooking. Only one service can be the default.</p>
          <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end">
            <label className="text-[11px] text-gray-500">Service name<input
              className="border border-black/15 rounded-lg px-2 py-1 text-sm flex-1"
              placeholder="New service name"
              value={newService.name}
              onChange={(e) => setNewService({ ...newService, name: e.target.value })}
            /></label>
            <label className="text-[11px] text-gray-500">Duration (minutes)<input
              type="number"
              min="1"
              className="w-full border border-black/15 rounded-lg px-2 py-1 text-sm"
              value={newService.durationMinutes}
              onChange={(e) => setNewService({ ...newService, durationMinutes: Number(e.target.value) })}
            /></label>
            <label className="text-[11px] text-gray-500">Price<input
              type="number"
              min="0" step="0.01"
              className="w-full border border-black/15 rounded-lg px-2 py-1 text-sm"
              value={newService.price}
              onChange={(e) => setNewService({ ...newService, price: Number(e.target.value) })}
            /></label>
            <Button variant="solid" onClick={() => addService.mutate()} disabled={!newService.name}>
              Add
            </Button>
          </div>
        </Card>
      </div>}

      {settingsView === 'regular' && (featureSettings.data?.retailProductsEnabled ?? true) && <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Retail products</h2>
        <Card>
          {products.data?.map((p) => (
            editingProduct?.id === p.id ? <div key={p.id} className="grid gap-2 border-b border-black/5 px-4 py-3 sm:grid-cols-[1fr_7rem_7rem_auto]"><input aria-label="Product name" className="rounded-lg border border-black/15 px-2 py-1.5 text-sm" value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} /><label className="text-[11px] text-gray-500">Price<input aria-label="Product price" type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-sm text-black" value={editingProduct.price} onChange={(event) => setEditingProduct({ ...editingProduct, price: Number(event.target.value) })} /></label><label className="text-[11px] text-gray-500">Stock quantity<input aria-label="Product stock quantity" type="number" min="0" className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-sm text-black" value={editingProduct.stockQty} onChange={(event) => setEditingProduct({ ...editingProduct, stockQty: Number(event.target.value) })} /></label><div className="flex items-end gap-1"><Button variant="solid" onClick={() => updateProduct.mutate(editingProduct)}>Save</Button><Button onClick={() => setEditingProduct(null)}>Cancel</Button></div></div> : <div key={p.id} className="flex items-center justify-between gap-3 border-b border-black/5 last:border-0 px-4 py-3 text-sm"><span>{p.name}</span><span className="ml-auto text-gray-500">${Number(p.price).toFixed(2)} · {p.stock_qty} in stock</span><Button onClick={() => setEditingProduct({ id: p.id, name: p.name, price: Number(p.price), stockQty: p.stock_qty })}>Edit</Button><button className="text-xs text-gray-400 hover:text-red-600" onClick={() => { if (window.confirm(`Remove ${p.name}?`)) removeProduct.mutate(p.id); }}>Delete</button></div>
          ))}
          <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end">
            <label className="text-[11px] text-gray-500">Product name<input
              className="w-full border border-black/15 rounded-lg px-2 py-1 text-sm"
              placeholder="New product name"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            /></label>
            <label className="text-[11px] text-gray-500">Price<input
              type="number"
              min="0" step="0.01" className="w-full border border-black/15 rounded-lg px-2 py-1 text-sm"
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
            /></label>
            <label className="text-[11px] text-gray-500">Stock quantity<input
              type="number"
              min="0" className="w-full border border-black/15 rounded-lg px-2 py-1 text-sm"
              value={newProduct.stockQty}
              onChange={(e) => setNewProduct({ ...newProduct, stockQty: Number(e.target.value) })}
            /></label>
            <Button variant="solid" onClick={() => addProduct.mutate()} disabled={!newProduct.name}>
              Add
            </Button>
          </div>
        </Card>
      </div>}

      {settingsView === 'advanced' && payrollSettings.data && <PayrollScheduleCard settings={payrollSettings.data} pending={updatePayrollSettings.isPending} onSave={(value) => updatePayrollSettings.mutate(value)} />}

      {settingsView === 'advanced' && <div id="team-setup"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Team roles & pay models</h2><Card className="divide-y divide-black/5"><div className="p-4"><h3 className="text-sm font-semibold">Custom pay models</h3><p className="mt-1 text-xs text-gray-500">Create a reusable pay option for roles or seniority levels, then assign it from an employee profile.</p><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Custom pay model name" placeholder="e.g. Senior barber hourly" className="min-w-48 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm" value={newPayModel.name} onChange={(event) => setNewPayModel({ ...newPayModel, name: event.target.value })} /><select aria-label="Custom pay calculation" className="rounded-lg border border-black/15 px-3 py-2 text-sm" value={newPayModel.calculationType} onChange={(event) => { const calculationType = event.target.value as PayModel['calculation_type']; setNewPayModel({ ...newPayModel, calculationType, defaultAmount: calculationType === 'commission' ? 50 : calculationType === 'booth_rent' ? 250 : calculationType === 'hourly' ? 20 : 50000 }); }}><option value="hourly">Hourly rate</option><option value="salary">Annual salary</option><option value="commission">Service commission</option><option value="booth_rent">Weekly booth rent</option></select><input aria-label="Custom pay default amount" type="number" min="0" step="0.01" className="w-28 rounded-lg border border-black/15 px-3 py-2 text-sm" value={newPayModel.defaultAmount} onChange={(event) => setNewPayModel({ ...newPayModel, defaultAmount: Number(event.target.value) })} /><Button variant="solid" disabled={!newPayModel.name.trim() || addPayModel.isPending} onClick={() => addPayModel.mutate()}>Add model</Button></div><div className="mt-3 flex flex-wrap gap-2">{payModels.data?.map((model) => <span key={model.id} className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs">{model.name} · {model.calculation_type.replace('_', ' ')} ({Number(model.default_amount).toLocaleString()})<button aria-label={`Remove ${model.name}`} className="text-gray-400 hover:text-red-600" onClick={() => removePayModel.mutate(model.id)}>×</button></span>)}{payModels.data?.length === 0 && <span className="text-xs text-gray-400">No custom models yet.</span>}</div></div><div className="p-4"><h3 className="text-sm font-semibold">Custom roles</h3><p className="mt-1 text-xs text-gray-500">Create job titles that match your shop. Each title uses Staff, Front desk, or Manager access.</p><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Custom role name" placeholder="e.g. Lead barber" className="min-w-48 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm" value={newJobRole.name} onChange={(event) => setNewJobRole({ ...newJobRole, name: event.target.value })} /><select aria-label="Custom role permission level" className="rounded-lg border border-black/15 px-3 py-2 text-sm" value={newJobRole.permissionRole} onChange={(event) => setNewJobRole({ ...newJobRole, permissionRole: event.target.value as JobRole['permission_role'] })}><option value="staff">Staff access</option><option value="front_desk">Front desk access</option><option value="location_manager">Manager access</option></select><Button variant="solid" disabled={!newJobRole.name.trim() || addJobRole.isPending} onClick={() => addJobRole.mutate()}>Add role</Button></div><div className="mt-3 flex flex-wrap gap-2">{jobRoles.data?.map((role) => <span key={role.id} className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs">{role.name} · {role.permission_role.replace('_', ' ')}<button aria-label={`Remove ${role.name}`} className="text-gray-400 hover:text-red-600" onClick={() => removeJobRole.mutate(role.id)}>×</button></span>)}{jobRoles.data?.length === 0 && <span className="text-xs text-gray-400">No custom roles yet.</span>}</div></div></Card></div>}

      {settingsView === 'advanced' && <div>
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
      </div>}

      {settingsView === 'regular' && (featureSettings.data?.discountCodesEnabled ?? true) && <div>
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
      </div>}

      {settingsView === 'advanced' && <div id="payments" className="scroll-mt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payments & cash drawer</h2>
        {cashConfig.data && (
          <Card className="overflow-hidden">
            <div className="p-4">
              <h3 className="text-sm font-semibold">Card payment workflow</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">Choose how this location takes card payments. Checkout only shows the connection settings for the option selected here.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([
                  { value: 'external', label: 'Manual', detail: 'Take payment elsewhere and record totals here.' },
                  { value: 'stripe', label: 'Stripe', detail: 'Process linked card payments through Stripe.' },
                  { value: 'square', label: 'Square', detail: 'Process linked card payments through Square.' },
                ] as const).map((option) => {
                  const selected = cashConfig.data.active_processor === option.value;
                  return <button key={option.value} type="button" aria-pressed={selected} onClick={() => updateCashConfig.mutate({ activeProcessor: option.value })} className={`rounded-xl border p-3 text-left transition ${selected ? 'border-[#315f52] bg-[#edf4f0] ring-1 ring-[#315f52]/20' : 'border-black/10 bg-white hover:border-black/25'}`}><span className="flex items-center justify-between gap-2"><strong className="text-sm">{option.label}</strong>{selected && <span className="text-xs font-semibold text-[#315f52]">Selected</span>}</span><span className="mt-1 block text-xs leading-4 text-gray-500">{option.detail}</span></button>;
                })}
              </div>
            </div>

            {cashConfig.data.active_processor === 'external' && <div className="border-t border-black/5 bg-stone-50/70 px-4 py-3"><p className="text-sm font-medium text-gray-700">Manual recordkeeping is active</p><p className="mt-1 text-xs text-gray-500">Staff will enter the sale total and tip after taking payment on a separate terminal. No payment credentials are required.</p></div>}

            {cashConfig.data.active_processor === 'stripe' && <div className="border-t border-black/5 bg-[#f7faf8] p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Stripe connection</h3><p className="mt-1 text-xs text-gray-500">Use the publishable key and connected account ID from your Stripe account.</p></div><Pill tone={cashConfig.data.stripe_publishable_key && cashConfig.data.stripe_connected_account_id ? 'green' : 'amber'}>{cashConfig.data.stripe_publishable_key && cashConfig.data.stripe_connected_account_id ? 'Configured' : 'Setup needed'}</Pill></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-gray-600">Publishable key<input aria-label="Stripe publishable key" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-mono text-sm text-black" defaultValue={cashConfig.data.stripe_publishable_key ?? ''} placeholder="pk_…" onBlur={(event) => updateCashConfig.mutate({ stripePublishableKey: event.target.value.trim() || null })} /></label><label className="text-xs font-medium text-gray-600">Connected account ID<input aria-label="Stripe connected account ID" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-mono text-sm text-black" defaultValue={cashConfig.data.stripe_connected_account_id ?? ''} placeholder="acct_…" onBlur={(event) => updateCashConfig.mutate({ stripeConnectedAccountId: event.target.value.trim() || null })} /></label></div></div>}

            {cashConfig.data.active_processor === 'square' && <div className="border-t border-black/5 bg-[#f7faf8] p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Square connection</h3><p className="mt-1 text-xs text-gray-500">Use the application and location IDs from your Square developer dashboard.</p></div><Pill tone={cashConfig.data.square_application_id && cashConfig.data.square_location_id ? 'green' : 'amber'}>{cashConfig.data.square_application_id && cashConfig.data.square_location_id ? 'Configured' : 'Setup needed'}</Pill></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-gray-600">Application ID<input aria-label="Square application ID" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-mono text-sm text-black" defaultValue={cashConfig.data.square_application_id ?? ''} placeholder="sq0idp-…" onBlur={(event) => updateCashConfig.mutate({ squareApplicationId: event.target.value.trim() || null })} /></label><label className="text-xs font-medium text-gray-600">Location ID<input aria-label="Square location ID" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-mono text-sm text-black" defaultValue={cashConfig.data.square_location_id ?? ''} placeholder="Location ID" onBlur={(event) => updateCashConfig.mutate({ squareLocationId: event.target.value.trim() || null })} /></label></div></div>}

            <div className="grid gap-3 border-t border-black/5 p-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-600">Starting drawer float<input aria-label="Starting drawer float" type="number" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black" defaultValue={cashConfig.data.starting_cash_float} onBlur={(event) => updateCashConfig.mutate({ startingCashFloat: Number(event.target.value) })} /></label>
              <label className="text-xs font-medium text-gray-600">Card processing fee %<input aria-label="Card processing fee percent" type="number" step="0.1" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black" defaultValue={cashConfig.data.card_fee_pct} onBlur={(event) => updateCashConfig.mutate({ cardFeePct: Number(event.target.value) })} /></label>
            </div>
          </Card>
        )}
      </div>}

      {settingsView === 'advanced' && pricingPolicy.data?.barberRequestMode !== 'same' && <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Barber request pricing</h2>
        {pricingPolicy.data && (
          <Card className="p-4 space-y-3">
            <p className="text-sm text-gray-500">When a client chooses a specific professional instead of Any available, decide whether to add a request premium and who receives it.</p>
            <div className="space-y-2">
              {(
                [
                  { value: 'same', label: 'Same price always' },
                  { value: 'per_staff', label: 'Per-staff price tier — each barber sets their own premium' },
                  { value: 'flat', label: 'Flat request surcharge — one fee regardless of who' },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="barberRequestMode"
                    checked={pricingPolicy.data.barberRequestMode === opt.value}
                    onChange={() => updatePricingPolicy.mutate({ ...pricingPolicy.data!, barberRequestMode: opt.value })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {pricingPolicy.data.barberRequestMode === 'flat' && (
              <label className="text-sm block">
                Flat surcharge amount
                <input
                  type="number"
                  step="0.01"
                  className="ml-2 border border-black/15 rounded-lg px-2 py-1 w-24"
                  defaultValue={pricingPolicy.data.flatSurchargeAmount}
                  onBlur={(e) => updatePricingPolicy.mutate({ ...pricingPolicy.data!, flatSurchargeAmount: Number(e.target.value) })}
                />
              </label>
            )}
            {pricingPolicy.data.barberRequestMode === 'per_staff' && (
              <div className="border-t border-black/5 pt-3 space-y-2">
                <div className="text-xs text-gray-400">Per-staff premium when requested by name</div>
                {roster.data?.map((r) => (
                  <div key={r.locationStaffId} className="flex items-center justify-between text-sm">
                    <span>{r.fullName}</span>
                    <input
                      type="number"
                      step="0.01"
                      className="border border-black/15 rounded-lg px-2 py-1 w-24 text-right"
                      defaultValue={r.priceTierAmount}
                      onBlur={(e) => updateStaffPriceTier.mutate({ id: r.locationStaffId, priceTierAmount: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-start gap-2 border-t border-black/5 pt-3 text-sm"><input className="mt-0.5" type="checkbox" checked={pricingPolicy.data.creditSurchargeToStaff} onChange={(event) => updatePricingPolicy.mutate({ ...pricingPolicy.data!, creditSurchargeToStaff: event.target.checked })} /><span><strong className="block">Credit the premium to the professional</strong><span className="mt-0.5 block text-xs font-normal text-gray-500">When enabled, the earned request premium is included in that professional’s attributed service revenue and commission calculation. When disabled, it remains shop revenue.</span></span></label>
          </Card>
        )}
      </div>}

      <div>
        {settingsView === 'regular' && <>
        {(communicationSettings.data?.enabled ?? true) && <>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Messages &amp; notifications</h2>
        <Card className="mb-6 p-4">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium">Customer messaging</p><p className="mt-1 text-xs leading-5 text-gray-500">Send booking confirmations and appointment reminders, then review delivery status from Messages.</p></div><label className="flex shrink-0 items-center gap-2 text-sm font-medium"><input aria-label="Enable customer messaging" type="checkbox" checked={communicationSettings.data?.enabled ?? true} onChange={(event) => updateCommunicationSettings.mutate({ enabled: event.target.checked })} />{communicationSettings.data?.enabled === false ? 'Off' : 'On'}</label></div>
          <div className={`mt-4 rounded-lg p-3 text-xs leading-5 ${(communicationSettings.data?.enabled ?? true) ? 'bg-green-50 text-green-900' : 'bg-stone-100 text-gray-600'}`}>{(communicationSettings.data?.enabled ?? true) ? <><strong className="block">What happens while enabled</strong>New selected messages are placed in the delivery queue and the Messages tab is visible. Enabling this setting alone does not send anything or create provider charges until an SMS/email provider is connected.</> : <><strong className="block">What happens while disabled</strong>The Messages tab is hidden and no new confirmations or reminders are queued. Existing message history is retained. Booking and checkout continue normally.</>}</div>
          {(communicationSettings.data?.enabled ?? true) && <div className="mt-4 border-t border-black/5 pt-4"><p className="mb-2 text-xs font-medium text-gray-500">Messages to send</p><div className="grid gap-2 text-sm sm:grid-cols-2"><label className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={communicationSettings.data?.bookingConfirmations ?? true} onChange={(event) => updateCommunicationSettings.mutate({ bookingConfirmations: event.target.checked })} /><span><strong className="block">Booking confirmations</strong><span className="text-xs text-gray-500">Sent after a customer books online.</span></span></label><label className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={communicationSettings.data?.appointmentReminders ?? true} onChange={(event) => updateCommunicationSettings.mutate({ appointmentReminders: event.target.checked })} /><span><strong className="block">Appointment reminders</strong><span className="text-xs text-gray-500">Scheduled for approximately 24 hours before an appointment.</span></span></label></div></div>}
        </Card>
        </>}

        <h2 id="store-hours" className="scroll-mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Store hours</h2>
        <Card className="mb-6">
          <div className="px-4 py-3 text-xs text-gray-500 border-b border-black/5">Used by public booking and Schedule to show when the location is open.</div>
          {(storeHours.data ?? []).map((day) => {
            const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const updateDay = (change: Partial<StoreHoursDay>) => updateStoreHours.mutate(storeHours.data!.map((item) => item.day_of_week === day.day_of_week ? { ...item, ...change } : item));
            return <div key={day.day_of_week} className="grid grid-cols-[7rem_5rem_1fr_1fr] items-center gap-2 border-b border-black/5 last:border-0 px-4 py-2.5 text-sm">
              <strong>{names[day.day_of_week]}</strong>
              <label className="flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={day.is_open} onChange={(event) => updateDay({ is_open: event.target.checked })} /> Open</label>
              <input aria-label={`${names[day.day_of_week]} opening time`} type="time" disabled={!day.is_open} value={day.open_time?.slice(0, 5) ?? '09:00'} onChange={(event) => updateDay({ open_time: event.target.value })} className="rounded-lg border border-black/15 px-2 py-1.5 disabled:opacity-40" />
              <input aria-label={`${names[day.day_of_week]} closing time`} type="time" disabled={!day.is_open} value={day.close_time?.slice(0, 5) ?? '18:00'} onChange={(event) => updateDay({ close_time: event.target.value })} className="rounded-lg border border-black/15 px-2 py-1.5 disabled:opacity-40" />
            </div>;
          })}
        </Card>

        <h3 id="special-hours" className="scroll-mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Special hours &amp; closures</h3>
        <Card className="mb-6">
          <div className="border-b border-black/5 px-4 py-3 text-xs text-gray-500">Add holidays, closures, or one-time hours. These dates override the regular weekly schedule.</div>
          {(specialHours.data ?? []).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 text-sm"><div><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong><span className="ml-2 text-gray-500">{item.label || (item.isClosed ? 'Closed' : 'Special hours')}</span><div className="text-xs text-gray-400">{item.isClosed ? 'Closed all day' : `${item.openTime?.slice(0, 5)}–${item.closeTime?.slice(0, 5)}`}</div></div><button className="text-xs text-red-600 hover:underline" onClick={() => removeSpecialHours.mutate(item.id)}>Remove</button></div>)}
          {(specialHours.data?.length ?? 0) === 0 && <p className="border-b border-black/5 px-4 py-3 text-sm text-gray-400">No upcoming special hours.</p>}
          <div className="space-y-3 px-4 py-3"><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-gray-500">Date<input type="date" min={new Date().toISOString().slice(0, 10)} value={newSpecialHours.date} onChange={(event) => setNewSpecialHours((value) => ({ ...value, date: event.target.value }))} className="mt-1 block w-full rounded-lg border border-black/15 px-2 py-1.5 text-sm text-black" /></label><label className="text-xs font-medium text-gray-500">Label<input placeholder="Holiday, private event…" value={newSpecialHours.label} onChange={(event) => setNewSpecialHours((value) => ({ ...value, label: event.target.value }))} className="mt-1 block w-full rounded-lg border border-black/15 px-2 py-1.5 text-sm text-black" /></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newSpecialHours.isClosed} onChange={(event) => setNewSpecialHours((value) => ({ ...value, isClosed: event.target.checked }))} />Closed all day</label>{!newSpecialHours.isClosed && <div className="rounded-xl bg-stone-50 p-3"><p className="mb-2 text-xs font-medium text-gray-600">New operating hours for this date</p><div className="grid grid-cols-2 gap-2"><label className="text-xs text-gray-500">Opens<input aria-label="Special opening time" type="time" value={newSpecialHours.openTime} onChange={(event) => setNewSpecialHours((value) => ({ ...value, openTime: event.target.value }))} className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm text-black" /></label><label className="text-xs text-gray-500">Closes<input aria-label="Special closing time" type="time" value={newSpecialHours.closeTime} onChange={(event) => setNewSpecialHours((value) => ({ ...value, closeTime: event.target.value }))} className="mt-1 block w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm text-black" /></label></div><p className="mt-2 text-xs text-gray-500">These hours replace the normal store hours for the selected date.</p></div>}<div className="flex justify-end"><Button variant="solid" disabled={!newSpecialHours.date || addSpecialHours.isPending} onClick={() => addSpecialHours.mutate()}>Add special date</Button></div></div>
        </Card>
        </>}

        {settingsView === 'advanced' && <><h2 id="scheduling" className="scroll-mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Scheduling policy</h2>
        <Card className="p-4 mb-2">
          <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">Weekly overtime warning threshold
            <div className="mt-1 flex items-center gap-2"><input key={`ot-${schedulingPolicy.data?.overtimeThresholdHours}`} type="number" min="1" max="168" step="0.5" className="w-24 rounded-lg border border-black/15 px-2 py-1.5" defaultValue={schedulingPolicy.data?.overtimeThresholdHours ?? 40} onBlur={(event) => updateSchedulingPolicy.mutate({ overtimeThresholdHours: Number(event.target.value) })} /><span className="text-xs text-gray-400">hours</span></div>
          </label>
          <label className="text-sm">Minimum people scheduled per day
            <input key={`coverage-${schedulingPolicy.data?.minimumCoverage}`} type="number" min="0" max="100" className="mt-1 block w-24 rounded-lg border border-black/15 px-2 py-1.5" defaultValue={schedulingPolicy.data?.minimumCoverage ?? 2} onBlur={(event) => updateSchedulingPolicy.mutate({ minimumCoverage: Number(event.target.value) })} />
          </label>
          <label className="text-sm">Service chairs
            <input key={`chairs-${schedulingPolicy.data?.chairCount}`} type="number" min="1" max="500" className="mt-1 block w-24 rounded-lg border border-black/15 px-2 py-1.5" defaultValue={schedulingPolicy.data?.chairCount ?? 4} onBlur={(event) => updateSchedulingPolicy.mutate({ chairCount: Number(event.target.value) })} />
          </label>
          </div>
          <p className="mt-3 text-xs text-gray-500">SmoothSoft compares overlapping shifts with the number of service chairs and flags times when more people are scheduled than can work.</p>
          <div className="mt-4 border-t border-black/5 pt-4">
            <p className="mb-3 text-sm font-medium">Labor cost planning</p>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Average hourly labor cost<div className="mt-1 flex items-center gap-1"><span className="text-gray-400">$</span><input key={`labor-${schedulingPolicy.data?.baseHourlyLaborCost}`} type="number" min="0" max="1000" step="0.01" className="w-24 rounded-lg border border-black/15 px-2 py-1.5" defaultValue={schedulingPolicy.data?.baseHourlyLaborCost ?? 24} onBlur={(event) => updateSchedulingPolicy.mutate({ baseHourlyLaborCost: Number(event.target.value) })} /></div></label><label className="text-sm">Payroll burden<div className="mt-1 flex items-center gap-1"><input key={`burden-${schedulingPolicy.data?.payrollBurdenPct}`} type="number" min="0" max="100" step="0.1" className="w-24 rounded-lg border border-black/15 px-2 py-1.5" defaultValue={schedulingPolicy.data?.payrollBurdenPct ?? 0} onBlur={(event) => updateSchedulingPolicy.mutate({ payrollBurdenPct: Number(event.target.value) })} /><span className="text-gray-400">%</span></div></label></div>
            <p className="mt-2 text-xs text-gray-500">The schedule uses these values to estimate staffing cost. Payroll burden can include employer taxes, insurance, and benefits.</p>
          </div>
          <label className="mt-4 flex items-center gap-2 border-t border-black/5 pt-4 text-sm">
            <input
              type="checkbox"
              checked={schedulingPolicy.data?.selfServeDefault ?? false}
              onChange={(e) => updateSchedulingPolicy.mutate({ selfServeDefault: e.target.checked })}
            />
            Employees can set their own schedule directly (default: approval required)
          </label>
        </Card>
        {schedulingPolicy.data?.selfServeDefault && <Card className="mt-2">
          <div className="grid grid-cols-[1fr_11rem] items-center gap-3 border-b border-black/5 px-4 py-2 text-xs text-gray-400"><span>Employee exceptions</span><span>Schedule editing</span></div>
          {roster.data?.map((r) => (
            <div key={r.locationStaffId} className="grid grid-cols-[1fr_11rem] items-center gap-3 border-b border-black/5 last:border-0 px-4 py-3 text-sm">
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
        </Card>}</>}
      </div>
    </div>
  );
}

function BestMatchCard({ settings, pending, onSave }: { settings: MatchingPolicy; pending: boolean; onSave: (value: number) => void }) {
  const [value, setValue] = useState(settings.continuityWeight);
  const description = value < 35 ? 'Favor team variety' : value > 65 ? 'Favor familiar barbers' : 'Balanced';
  return <Card className="mt-3 overflow-hidden"><div className="p-4"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">Best match behavior</h3><p className="mt-1 max-w-xl text-xs leading-5 text-gray-500">For signed-in clients with service history, choose whether an otherwise eligible match should favor a familiar barber or help the client get comfortable with more of the team.</p></div><Pill tone="green">{description}</Pill></div><div className="mt-5"><input aria-label="Client continuity preference" type="range" min="0" max="100" step="5" value={value} onChange={(event) => setValue(Number(event.target.value))} onPointerUp={() => onSave(value)} onKeyUp={() => onSave(value)} onBlur={() => { if (value !== settings.continuityWeight) onSave(value); }} className="w-full accent-[#315f52]" /><div className="mt-1 flex justify-between text-[11px] font-medium text-gray-500"><span>Team variety</span><span>Balanced</span><span>Familiar barber</span></div></div><div className="mt-4 rounded-xl bg-[#f3f7f4] px-3 py-2.5 text-xs leading-5 text-[#49665b]"><strong className="block">What this changes</strong>History is a low-weight tie-breaker only. Named requests, clock-in status, availability, and queue fairness still take priority. {pending ? 'Saving preference…' : `Current history preference: ${value}%.`}</div></div></Card>;
}

function PayrollScheduleCard({ settings, pending, onSave }: { settings: PayrollSettings; pending: boolean; onSave: (value: Pick<PayrollSettings, 'scheduleName' | 'frequency' | 'anchorDate' | 'workweekStartsOn' | 'paydayOffsetBusinessDays'>) => void }) {
  const [draft, setDraft] = useState({ scheduleName: settings.scheduleName, frequency: settings.frequency, anchorDate: settings.anchorDate, workweekStartsOn: settings.workweekStartsOn, paydayOffsetBusinessDays: settings.paydayOffsetBusinessDays });
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return <div id="payroll" className="scroll-mt-4"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payroll schedule</h2><Card className="overflow-hidden"><div className="grid gap-6 p-4 lg:grid-cols-[1fr_19rem]"><div><div className="mb-4"><h3 className="text-sm font-semibold">{settings.scheduleName}</h3><p className="mt-1 text-xs leading-5 text-gray-500">Sets the date ranges used in Revenue by staff and saved pay-period reviews. SmoothSoft prepares payroll records; it does not move money or file taxes.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Schedule name<input aria-label="Pay schedule name" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={draft.scheduleName} onChange={(event) => setDraft({ ...draft, scheduleName: event.target.value })} /></label><label className="text-sm">Pay frequency<select aria-label="Pay frequency" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as PayrollSettings['frequency'] })}><option value="weekly">Weekly · 52 periods/year</option><option value="biweekly">Every two weeks · 26 periods/year</option><option value="semimonthly">Twice monthly · 24 periods/year</option><option value="monthly">Monthly · 12 periods/year</option></select></label>{(draft.frequency === 'weekly' || draft.frequency === 'biweekly') && <label className="text-sm">A known period starts<input aria-label="Known pay period start" type="date" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={draft.anchorDate} onChange={(event) => setDraft({ ...draft, anchorDate: event.target.value })} /><span className="mt-1 block text-xs text-gray-500">Choose the first day of a pay period you know is correct. SmoothSoft uses it to calculate every weekly or biweekly period.</span></label>}<label className="text-sm">Workweek starts<select aria-label="Payroll workweek start" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={draft.workweekStartsOn} onChange={(event) => setDraft({ ...draft, workweekStartsOn: Number(event.target.value) })}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><span className="mt-1 block text-xs text-gray-500">Sets the seven-day window used for overtime warnings. It does not change payday.</span></label><label className="text-sm sm:col-span-2">Payday after period closes<select aria-label="Payday business-day delay" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={draft.paydayOffsetBusinessDays} onChange={(event) => setDraft({ ...draft, paydayOffsetBusinessDays: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5, 7, 10].map((count) => <option key={count} value={count}>{count === 0 ? 'Same business day' : `${count} business day${count === 1 ? '' : 's'} later`}</option>)}</select></label></div><div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-gray-500">Saving updates future periods only. Logged pay periods never change.</p><Button variant="solid" disabled={pending || !draft.scheduleName.trim()} onClick={() => onSave(draft)}>{pending ? 'Saving…' : 'Save schedule'}</Button></div></div><div className="rounded-xl bg-stone-50 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Upcoming payroll dates</h3><div className="mt-2 divide-y divide-black/5">{settings.upcomingPeriods.map((period, index) => <div key={period.periodStart} className="py-3 text-xs"><div className="flex items-center justify-between gap-3"><strong>{index === 0 ? 'Current period' : `Upcoming ${index}`}</strong>{index === 0 && <Pill tone="green">Active</Pill>}</div><div className="mt-1 text-gray-600">{period.periodStart} – {period.periodEnd}</div><div className="mt-0.5 text-gray-500">Payday {period.payDate}</div></div>)}</div></div></div></Card></div>;
}
