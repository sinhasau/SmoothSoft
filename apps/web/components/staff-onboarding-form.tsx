'use client';

import { useState } from 'react';
import { formatPhoneInput } from '../lib/phone';
import { Button } from './ui';
import { Modal } from './modal';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface NewStaffPayload {
  fullName: string;
  email?: string;
  phone?: string;
  role: 'location_manager' | 'staff' | 'front_desk';
  classification: 'w2' | '1099';
  employmentStatus: 'active' | 'inactive';
  hireDate?: string;
  jobRoleId?: string;
  commissionPct?: number;
  boothRentWeekly?: number;
  hourlyRate?: number;
  annualSalary?: number;
  customPayModelId?: string;
  socialSecurityNumber?: string;
  dailyRevenueGoal?: number;
  clientsPerDayGoal?: number;
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[];
  complianceDocuments?: { docType: string; issuedAt?: string; expiresAt?: string; status: 'valid' }[];
}

export interface CustomPayModel { id: string; name: string; calculation_type: 'commission' | 'booth_rent' | 'hourly' | 'salary'; default_amount: string }
export interface CustomJobRole { id: string; name: string; permission_role: 'location_manager' | 'staff' | 'front_desk' }

export function StaffOnboardingForm({ pending, error, payModels = [], jobRoles = [], onCancel, onSubmit }: { pending: boolean; error?: string | null; payModels?: CustomPayModel[]; jobRoles?: CustomJobRole[]; onCancel: () => void; onSubmit: (payload: NewStaffPayload) => void }) {
  const [identity, setIdentity] = useState({ fullName: '', email: '', phone: '', hireDate: new Date().toISOString().slice(0, 10), employmentStatus: 'active' as 'active' | 'inactive' });
  const [socialSecurityNumber, setSocialSecurityNumber] = useState('');
  const [role, setRole] = useState<'location_manager' | 'staff' | 'front_desk'>('staff');
  const [jobRoleId, setJobRoleId] = useState('');
  const [classification, setClassification] = useState<'w2' | '1099'>('w2');
  const [payModel, setPayModel] = useState('commission');
  const [payAmount, setPayAmount] = useState(50);
  const [days, setDays] = useState<number[]>([]);
  const [hours, setHours] = useState({ start: '09:00', end: '17:00' });
  const [goals, setGoals] = useState({ revenue: 350, clients: 10 });
  const [license, setLicense] = useState({ name: '', issuedAt: '', expiresAt: '' });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      fullName: identity.fullName.trim(), email: identity.email.trim() || undefined, phone: identity.phone.trim() || undefined,
      role, jobRoleId: jobRoleId || undefined, classification, employmentStatus: identity.employmentStatus, hireDate: identity.hireDate || undefined, socialSecurityNumber: socialSecurityNumber || undefined,
      ...(payModel === 'commission' ? { commissionPct: payAmount } : payModel === 'booth_rent' ? { boothRentWeekly: payAmount } : payModel === 'hourly' ? { hourlyRate: payAmount } : payModel === 'salary' ? { annualSalary: payAmount } : (() => { const model = payModels.find((item) => item.id === payModel)!; return { customPayModelId: model.id, ...(model.calculation_type === 'commission' ? { commissionPct: payAmount } : model.calculation_type === 'booth_rent' ? { boothRentWeekly: payAmount } : model.calculation_type === 'hourly' ? { hourlyRate: payAmount } : { annualSalary: payAmount }) }; })()),
      dailyRevenueGoal: goals.revenue, clientsPerDayGoal: goals.clients,
      schedule: days.sort((a, b) => a - b).map((dayOfWeek) => ({ dayOfWeek, startTime: hours.start, endTime: hours.end })),
      complianceDocuments: license.name.trim() ? [{ docType: license.name.trim().toLowerCase().replace(/\s+/g, '_'), issuedAt: license.issuedAt || undefined, expiresAt: license.expiresAt || undefined, status: 'valid' }] : undefined,
    });
  }

  return <Modal onClose={onCancel} size="xl" label="New team member onboarding" padded={false} dismissible={!pending}><form aria-label="New team member onboarding" onSubmit={submit}><div className="flex items-start justify-between border-b border-black/10 px-6 py-5"><div><h2 className="text-lg font-semibold">Add team member</h2><p className="mt-1 text-sm text-gray-500">Add the details needed for scheduling, payroll preparation, and compliance.</p></div><button type="button" aria-label="Close onboarding form" className="text-2xl leading-none text-gray-400 hover:text-black" onClick={onCancel}>×</button></div><div className="space-y-6 px-6 py-5">
    <fieldset><legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Basic information</legend><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Full name<input required autoFocus className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={identity.fullName} onChange={(event) => setIdentity({ ...identity, fullName: event.target.value })} /></label><label className="text-sm">Start date<input type="date" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={identity.hireDate} onChange={(event) => setIdentity({ ...identity, hireDate: event.target.value })} /></label><label className="text-sm">Email<input type="email" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={identity.email} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} /></label><label className="text-sm">Phone<input type="tel" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={identity.phone} onChange={(event) => setIdentity({ ...identity, phone: formatPhoneInput(event.target.value) })} /></label><label className="text-sm">Role<select className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={jobRoleId || role} onChange={(event) => { const custom = jobRoles.find((item) => item.id === event.target.value); setJobRoleId(custom?.id ?? ''); setRole(custom?.permission_role ?? event.target.value as typeof role); }}><option value="staff">Barber / stylist</option><option value="front_desk">Front desk</option><option value="location_manager">Manager</option>{jobRoles.length > 0 && <optgroup label="Custom roles">{jobRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select></label><label className="text-sm">Initial status<select className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={identity.employmentStatus} onChange={(event) => setIdentity({ ...identity, employmentStatus: event.target.value as 'active' | 'inactive' })}><option value="active">Active</option><option value="inactive">Inactive / pre-hire</option></select></label></div></fieldset>
    <fieldset><legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Employment & pay</legend><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Classification<select className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={classification} onChange={(event) => setClassification(event.target.value as 'w2' | '1099')}><option value="w2">W-2 employee</option><option value="1099">1099 contractor</option></select></label><label className="text-sm">Pay model<select className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={payModel} onChange={(event) => { const model = event.target.value; setPayModel(model); const custom = payModels.find((item) => item.id === model); setPayAmount(custom ? Number(custom.default_amount) : model === 'commission' ? 50 : model === 'booth_rent' ? 250 : model === 'hourly' ? 20 : 50000); }}><option value="commission">Service commission</option><option value="booth_rent">Weekly booth rent</option><option value="hourly">Hourly</option><option value="salary">Annual salary</option>{payModels.length > 0 && <optgroup label="Custom pay models">{payModels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select></label><label className="text-sm">{(() => { const type = payModels.find((item) => item.id === payModel)?.calculation_type ?? payModel; return type === 'commission' ? 'Commission %' : type === 'booth_rent' ? 'Weekly rent $' : type === 'hourly' ? 'Hourly rate $' : 'Annual salary $'; })()}<input type="number" min="0" step="0.01" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={payAmount} onChange={(event) => setPayAmount(Number(event.target.value))} /></label><label className="text-sm sm:col-span-2">Social Security number <span className="text-gray-400">(restricted)</span><input aria-label="Social Security number" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9 -]{9,11}" placeholder="•••-••-••••" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={socialSecurityNumber} onChange={(event) => setSocialSecurityNumber(event.target.value.replace(/[^0-9-]/g, '').slice(0, 11))} /><span className="mt-1 block text-xs text-gray-500">Stored securely. After saving, only the last four digits are shown.</span></label></div></fieldset>
    <fieldset><legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Regular availability</legend><div className="mb-3 flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${days.includes(index) ? 'border-black bg-black text-white' : 'border-black/10'}`}><input className="sr-only" type="checkbox" checked={days.includes(index)} onChange={() => setDays((selected) => selected.includes(index) ? selected.filter((value) => value !== index) : [...selected, index])} />{day}</label>)}</div><div className="grid grid-cols-2 gap-3"><label className="text-sm">Typical start<input type="time" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={hours.start} onChange={(event) => setHours({ ...hours, start: event.target.value })} /></label><label className="text-sm">Typical end<input type="time" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={hours.end} onChange={(event) => setHours({ ...hours, end: event.target.value })} /></label></div></fieldset>
    <fieldset><legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Goals & credential</legend><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Daily revenue goal<input type="number" min="0" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={goals.revenue} onChange={(event) => setGoals({ ...goals, revenue: Number(event.target.value) })} /></label><label className="text-sm">Clients per day goal<input type="number" min="0" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={goals.clients} onChange={(event) => setGoals({ ...goals, clients: Number(event.target.value) })} /></label><label className="text-sm sm:col-span-2">License or credential (optional)<input placeholder="Barber license" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={license.name} onChange={(event) => setLicense({ ...license, name: event.target.value })} /></label><label className="text-sm">Date issued<input type="date" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={license.issuedAt} onChange={(event) => setLicense({ ...license, issuedAt: event.target.value })} /></label><label className="text-sm">Date expiring<input type="date" className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={license.expiresAt} onChange={(event) => setLicense({ ...license, expiresAt: event.target.value })} /></label></div><p className="mt-2 text-xs text-gray-500">After creation, open the employee profile to attach license images or documents.</p></fieldset>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div><div className="flex justify-end gap-2 border-t border-black/10 px-6 py-4"><Button onClick={onCancel} disabled={pending}>Cancel</Button><Button type="submit" variant="solid" disabled={pending || !identity.fullName.trim()}>{pending ? 'Creating…' : 'Create team member'}</Button></div></form></Modal>;
}
