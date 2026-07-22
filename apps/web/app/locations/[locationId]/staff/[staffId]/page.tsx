'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
import { useRequireAuth } from '../../../../../lib/auth';
import { Button, Card, Pill } from '../../../../../components/ui';
import Link from 'next/link';

interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface StaffDetail {
  locationStaffId: string;
  fullName: string;
  role: string;
  jobRoleName: string | null;
  jobRoleId: string | null;
  /** Omitted by the API for non-management roles — payroll-sensitive. */
  classification?: string;
  status: string;
  employmentStatus: 'active' | 'inactive' | 'resigned';
  compensation: { commission_pct: string | null; booth_rent_weekly: string | null; hourly_rate: string | null; annual_salary: string | null; custom_pay_model_id: string | null; custom_pay_model_name: string | null } | null;
  maskedSsn: string | null;
  goals: { daily_revenue: string | null; clients_per_day: number | null } | null;
  schedule: ScheduleDay[];
}

interface ComplianceDocument {
  id: string;
  docType: string;
  description: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: 'valid' | 'needs_attention' | 'overdue';
  locationStaffId: string | null;
}

interface ComplianceFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface ServicePerformance {
  serviceId: string;
  serviceName: string;
  serviceDefaultMinutes: number;
  averageMinutes: number;
  sampleCount: number;
  predictionReady: boolean;
}
interface PayModel { id: string; name: string; calculation_type: 'commission' | 'booth_rent' | 'hourly' | 'salary'; default_amount: string }
interface JobRole { id: string; name: string; permission_role: 'location_manager' | 'staff' | 'front_desk' }

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? ':' + String(m).padStart(2, '0') : ''}${period}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(file: ComplianceFile) {
  if (file.mimeType.startsWith('image/')) return 'Image';
  if (file.mimeType === 'application/pdf') return 'PDF';
  if (file.mimeType.includes('word')) return 'Word';
  if (file.mimeType.includes('excel') || file.mimeType.includes('spreadsheet')) return 'Excel';
  if (file.mimeType.includes('powerpoint') || file.mimeType.includes('presentation')) return 'PowerPoint';
  if (file.mimeType.includes('zip')) return 'Archive';
  return 'Document';
}

function canPreview(file: ComplianceFile) {
  return file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/');
}

export default function StaffDetailPage({ params }: { params: { locationId: string; staffId: string } }) {
  const auth = useRequireAuth();
  const canManage = auth?.role === 'org_owner' || auth?.role === 'location_manager';
  const isSelf = auth?.locationStaffId === params.staffId;
  const queryClient = useQueryClient();
  const { data: roster } = useQuery({ queryKey: ['settings', 'staff'], queryFn: () => api.get<StaffDetail[]>('/settings/staff') });
  const person = roster?.find((r) => r.locationStaffId === params.staffId);

  const allDocs = useQuery({ queryKey: ['settings', 'compliance-documents'], queryFn: () => api.get<ComplianceDocument[]>('/settings/compliance-documents'), enabled: canManage });
  const performance = useQuery({ queryKey: ['settings', 'staff', params.staffId, 'service-performance'], queryFn: () => api.get<ServicePerformance[]>(`/settings/staff/${params.staffId}/service-performance`), enabled: canManage || isSelf });
  const payModels = useQuery({ queryKey: ['settings', 'pay-models'], queryFn: () => api.get<PayModel[]>('/settings/pay-models'), enabled: canManage });
  const jobRoles = useQuery({ queryKey: ['settings', 'job-roles'], queryFn: () => api.get<JobRole[]>('/settings/job-roles'), enabled: canManage });
  const docs = allDocs.data?.filter((d) => d.locationStaffId === params.staffId) ?? [];

  const [newDocType, setNewDocType] = useState('');
  const [newDocExpiry, setNewDocExpiry] = useState('');
  const [newDocIssued, setNewDocIssued] = useState('');
  const [newDocFiles, setNewDocFiles] = useState<File[]>([]);
  const [newDocWarning, setNewDocWarning] = useState('');
  const [replacementSsn, setReplacementSsn] = useState('');

  const invalidateDocs = () => void queryClient.invalidateQueries({ queryKey: ['settings', 'compliance-documents'] });

  const addDoc = useMutation({
    mutationFn: async () => {
      const document = await api.post<{ id: string }>(`/settings/staff/${params.staffId}/compliance-documents`, { docType: newDocType, issuedAt: newDocIssued || null, expiresAt: newDocExpiry || null });
      const uploads = await Promise.allSettled(newDocFiles.map((file) => api.upload(`/settings/compliance-documents/${document.id}/files`, file)));
      return { document, failedUploads: uploads.filter((result) => result.status === 'rejected').length };
    },
    onSuccess: ({ failedUploads }) => {
      setNewDocType('');
      setNewDocExpiry('');
      setNewDocIssued('');
      setNewDocFiles([]);
      setNewDocWarning(failedUploads ? `Document saved, but ${failedUploads} attachment${failedUploads === 1 ? '' : 's'} could not be uploaded.` : '');
      invalidateDocs();
    },
  });

  const updateDoc = useMutation({
    mutationFn: ({ id, ...dto }: { id: string; status?: ComplianceDocument['status']; issuedAt?: string | null; expiresAt?: string | null }) =>
      api.put(`/settings/compliance-documents/${id}`, dto),
    onSuccess: invalidateDocs,
  });

  const removeDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/compliance-documents/${id}`),
    onSuccess: invalidateDocs,
  });
  const updateEmploymentStatus = useMutation({ mutationFn: (employmentStatus: StaffDetail['employmentStatus']) => api.put(`/settings/staff/${params.staffId}/employment-status`, { employmentStatus }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }) });
  const updateTaxIdentity = useMutation({ mutationFn: () => api.put(`/settings/staff/${params.staffId}/tax-identity`, { socialSecurityNumber: replacementSsn }), onSuccess: () => { setReplacementSsn(''); void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }); } });
  const updateJobRole = useMutation({ mutationFn: ({ role, jobRoleId }: { role: 'location_manager' | 'staff' | 'front_desk'; jobRoleId?: string | null }) => api.put(`/settings/staff/${params.staffId}/job-role`, { role, jobRoleId }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }) });

  if (!roster) return <p className="text-gray-500">Loading…</p>;
  if (!person) return <p className="text-gray-500">Staff member not found.</p>;
  if (!canManage && !isSelf) return <Card className="mx-auto max-w-lg p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Private profile</p><h1 className="mt-1 text-xl font-semibold">This team profile is restricted</h1><p className="mt-2 text-sm text-gray-500">Employees can view their own work details. Managers can open and maintain the full team roster.</p><Link href={`/locations/${params.locationId}`} className="mt-4 inline-block text-sm font-medium text-[#315c4f] underline">Back to overview</Link></Card>;
  const showClassification = auth?.role === 'org_owner' || auth?.role === 'location_manager';

  return (
    <div className="max-w-4xl space-y-7">
      <Card className="relative overflow-hidden border-amber-200/60 bg-gradient-to-br from-[#fffdf7] via-white to-[#f1f7f3] p-6 shadow-[0_12px_35px_rgba(60,45,25,0.06)]">
        <div aria-hidden="true" className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-amber-100/45 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#264f43] text-lg font-semibold text-[#fffaf0] shadow-sm">{person.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Team profile</p>
              <h2 className="text-2xl font-semibold tracking-tight">{person.fullName}</h2>
              <p className="mt-0.5 text-sm capitalize text-gray-500">
                {person.jobRoleName ?? person.role.replace('_', ' ')}
                {showClassification && person.classification ? ` · ${person.classification.toUpperCase()}` : ''}
              </p>
            </div>
          </div>
          {canManage ? <label className="text-xs font-medium text-gray-500">Employment status<select aria-label="Employment status" className="mt-1.5 block min-w-32 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-black shadow-sm" value={person.employmentStatus} onChange={(event) => updateEmploymentStatus.mutate(event.target.value as StaffDetail['employmentStatus'])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="resigned">Resigned</option></select></label> : <Pill tone="green">{person.employmentStatus}</Pill>}
        </div>

        {showClassification && <label className="relative mt-5 block max-w-sm text-xs font-medium text-gray-500">Role<select aria-label="Team member role" className="mt-1.5 block w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-normal text-black shadow-sm" value={person.jobRoleId ?? person.role} onChange={(event) => { const custom = jobRoles.data?.find((role) => role.id === event.target.value); updateJobRole.mutate({ role: custom?.permission_role ?? event.target.value as 'location_manager' | 'staff' | 'front_desk', jobRoleId: custom?.id ?? null }); }}><option value="staff">Barber / stylist</option><option value="front_desk">Front desk</option><option value="location_manager">Manager</option>{(jobRoles.data?.length ?? 0) > 0 && <optgroup label="Custom roles">{jobRoles.data!.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</optgroup>}</select></label>}

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Compensation</div>
            <div className="mt-1 text-sm font-semibold">
              {person.compensation?.commission_pct
                ? `${person.compensation.commission_pct}% commission`
                : person.compensation?.booth_rent_weekly
                  ? `$${person.compensation.booth_rent_weekly}/wk booth rent`
                  : person.compensation?.hourly_rate
                    ? `$${person.compensation.hourly_rate}/hour`
                    : person.compensation?.annual_salary
                      ? `$${Number(person.compensation.annual_salary).toLocaleString()}/year`
                  : '—'}
              {person.compensation?.custom_pay_model_name && <span className="ml-1 text-xs text-gray-500">({person.compensation.custom_pay_model_name})</span>}
            </div>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Daily goals</div>
            <div className="mt-1 text-sm font-semibold">
              {person.goals?.daily_revenue ? `$${person.goals.daily_revenue}/day` : '—'}
              {person.goals?.clients_per_day ? ` · ${person.goals.clients_per_day} clients/day` : ''}
            </div>
          </div>
        </div>
        {canManage && <CompensationEditor staffId={params.staffId} classification={person.classification ?? 'w2'} compensation={person.compensation} payModels={payModels.data ?? []} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] })} />}
      </Card>


      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6558]">Weekly schedule</h3>
        {canManage ? <WeeklyScheduleEditor locationStaffId={person.locationStaffId} initial={person.schedule ?? []} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] })} /> : <Card className="divide-y divide-black/5 overflow-hidden">{(person.schedule ?? []).map((day) => <div key={day.day_of_week} className="flex items-center justify-between px-4 py-3 text-sm"><strong>{DAY_LABELS[day.day_of_week]}</strong><span className="text-gray-500">{fmtTime(day.start_time)}–{fmtTime(day.end_time)}</span></div>)}{!(person.schedule?.length) && <p className="px-4 py-4 text-sm text-gray-400">No regular hours are set.</p>}</Card>}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6558]">Service performance</h3>
        <Card className="overflow-hidden border-black/[0.07] bg-white/80 shadow-sm">
          <p className="border-b border-black/5 px-4 py-3 text-xs text-gray-500">SmoothSoft learns this employee’s typical service times from their 10 most recent completed visits. Until enough history is available, wait estimates use the service’s standard duration.</p>
          {(performance.data?.length ?? 0) === 0 && <p className="px-4 py-3 text-sm text-gray-400">No completed services yet. Wait estimates will use each service’s standard duration until this employee builds history.</p>}
          {performance.data?.map((item) => <div key={item.serviceId} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-black/5 px-4 py-3 last:border-0"><div><strong className="text-sm font-medium">{item.serviceName}</strong><p className="text-xs text-gray-500">{item.sampleCount} of 10 recent completion{item.sampleCount === 1 ? '' : 's'} · default {item.serviceDefaultMinutes} min</p></div><div className="text-right"><div className="text-lg font-semibold">{item.averageMinutes} min</div><span className={`text-xs ${item.predictionReady ? 'text-green-700' : 'text-amber-700'}`}>{item.predictionReady ? 'Used for predictions' : 'Building history · using standard time'}</span></div></div>)}
        </Card>
      </div>

      {canManage && <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6558]">Documents &amp; licenses</h3>
        <Card className="overflow-hidden border-black/[0.07] bg-white/80 shadow-sm">
          {docs.length === 0 && <div className="border-b border-black/5 px-4 py-4"><p className="text-sm font-medium text-gray-700">No documents on file</p><p className="mt-0.5 text-xs text-gray-400">Add a license, certification, or employee document below.</p></div>}
          {docs.map((d) => (
            <div key={d.id} className="border-b border-black/5 px-4 py-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="truncate font-medium">{d.docType}</div>{d.description && <div className="mt-0.5 text-xs text-gray-500">{d.description}</div>}</div>
                <div className="flex shrink-0 items-center gap-2"><Pill tone={d.status === 'overdue' ? 'red' : d.status === 'needs_attention' ? 'amber' : 'green'}>{d.status.replace(/_/g, ' ')}</Pill><button className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeDoc.mutate(d.id)} aria-label={`Remove ${d.docType}`} title="Remove document">✕</button></div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-gray-500">Date issued<input type="date" className="mt-1 block w-full rounded-lg border border-black/15 px-2 py-1.5 text-sm text-black" defaultValue={d.issuedAt ?? ''} onBlur={(e) => updateDoc.mutate({ id: d.id, issuedAt: e.target.value || null })} /></label>
                <label className="text-[11px] text-gray-500">Date expiring<input
                  type="date"
                  className="mt-1 block w-full rounded-lg border border-black/15 px-2 py-1.5 text-sm text-black"
                  defaultValue={d.expiresAt ?? ''}
                  onBlur={(e) => updateDoc.mutate({ id: d.id, expiresAt: e.target.value || null })}
                /></label>
              </div>
              {!d.expiresAt && d.status !== 'valid' && <div className="mt-2"><Button onClick={() => updateDoc.mutate({ id: d.id, status: 'valid' })}>Mark valid</Button></div>}
              <ComplianceFiles documentId={d.id} />
            </div>
          ))}
          <div className="px-4 py-4">
            <div className="mb-3"><p className="text-sm font-medium">Add document</p><p className="mt-0.5 text-xs text-gray-400">Create the record now; dates and files can be added or replaced at any time.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-600 sm:col-span-2">Document or license name<input className="mt-1.5 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" placeholder="For example, barber license" value={newDocType} onChange={(e) => setNewDocType(e.target.value)} /></label>
              <label className="text-xs font-medium text-gray-600">Date issued <span className="font-normal text-gray-400">(optional)</span><input aria-label="New document date issued" type="date" className="mt-1.5 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" value={newDocIssued} onChange={(e) => setNewDocIssued(e.target.value)} /></label>
              <label className="text-xs font-medium text-gray-600">Date expiring <span className="font-normal text-gray-400">(optional)</span><input aria-label="New document date expiring" type="date" className="mt-1.5 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" value={newDocExpiry} onChange={(e) => setNewDocExpiry(e.target.value)} /></label>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-black/15 bg-stone-50 px-3 py-2 text-xs text-gray-600 hover:border-black/30 sm:col-span-2"><span className="min-w-0 truncate">{newDocFiles.length ? `${newDocFiles.length} attachment${newDocFiles.length === 1 ? '' : 's'} · ${newDocFiles.map((file) => file.name).join(', ')}` : 'Attach pictures or documents (optional)'}</span><strong className="shrink-0 font-medium text-black">Choose files</strong><input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip" onChange={(event) => setNewDocFiles(Array.from(event.target.files ?? []))} /></label>
              {addDoc.isError && <p className="text-xs text-red-600 sm:col-span-2">The document record could not be saved.</p>}
              {newDocWarning && <p className="text-xs text-amber-700 sm:col-span-2">{newDocWarning} Open the document above to retry.</p>}
              <div className="flex justify-end sm:col-span-2"><Button variant="solid" onClick={() => addDoc.mutate()} disabled={!newDocType.trim() || addDoc.isPending}>{addDoc.isPending ? 'Adding…' : 'Add document'}</Button></div>
            </div>
          </div>
        </Card>
      </div>}
      {canManage && <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6558]">Tax identity</h3><Card className="border-black/[0.07] bg-white/80 p-4 shadow-sm"><div className="flex flex-wrap items-end gap-3"><label className="min-w-56 flex-1 text-sm">Social Security number<input aria-label="Replacement Social Security number" type="password" inputMode="numeric" autoComplete="off" placeholder={person.maskedSsn ?? '•••-••-••••'} className="mt-1 block w-full rounded-lg border border-black/15 px-3 py-2" value={replacementSsn} onChange={(event) => setReplacementSsn(event.target.value.replace(/[^0-9-]/g, '').slice(0, 11))} /></label><Button variant="solid" disabled={!replacementSsn || updateTaxIdentity.isPending} onClick={() => updateTaxIdentity.mutate()}>{person.maskedSsn ? 'Replace SSN' : 'Save SSN'}</Button></div><p className="mt-2 text-xs text-gray-500">Stored securely: <strong>{person.maskedSsn ?? 'Not provided'}</strong>. SmoothSoft always masks the first five digits.</p>{updateTaxIdentity.isError && <p role="alert" className="mt-2 text-xs text-red-600">Could not save this SSN. Check the number and try again.</p>}</Card></div>}
    </div>
  );
}

function CompensationEditor({ staffId, classification, compensation, payModels, onSaved }: { staffId: string; classification: string; compensation: StaffDetail['compensation']; payModels: PayModel[]; onSaved: () => void }) {
  const initialModel = compensation?.custom_pay_model_id ?? (compensation?.annual_salary ? 'salary' : compensation?.hourly_rate ? 'hourly' : compensation?.booth_rent_weekly ? 'booth_rent' : 'commission');
  const initialAmount = Number(compensation?.annual_salary ?? compensation?.hourly_rate ?? compensation?.booth_rent_weekly ?? compensation?.commission_pct ?? 0);
  const [model, setModel] = useState(initialModel);
  const [amount, setAmount] = useState(initialAmount);
  const calculationType = payModels.find((item) => item.id === model)?.calculation_type ?? model;
  const save = useMutation({ mutationFn: () => api.put(`/settings/staff/${staffId}/compensation`, { classification, ...(payModels.some((item) => item.id === model) ? { customPayModelId: model } : {}), ...(calculationType === 'commission' ? { commissionPct: amount } : calculationType === 'booth_rent' ? { boothRentWeekly: amount } : calculationType === 'hourly' ? { hourlyRate: amount } : { annualSalary: amount }) }), onSuccess: onSaved });
  const amountLabel = calculationType === 'commission' ? 'Commission %' : calculationType === 'booth_rent' ? 'Weekly rent $' : calculationType === 'hourly' ? 'Hourly rate $' : 'Annual salary $';
  return (
    <details className="group relative mt-4 overflow-hidden rounded-2xl border border-[#d9e6df] bg-[#f7faf8]/90 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span>
          <strong className="block text-sm font-semibold text-[#244a40]">Adjust compensation</strong>
          <span className="mt-0.5 block text-xs text-gray-500">Update this employee’s pay model or rate.</span>
        </span>
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-white text-base text-[#436b5f] shadow-sm transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[#d9e6df] bg-white/80 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <label className="text-xs font-medium text-gray-600">Pay model
            <select aria-label="Employee pay model" className="mt-1.5 block w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-black shadow-sm" value={model} onChange={(event) => { const next = event.target.value; const custom = payModels.find((item) => item.id === next); setModel(next); setAmount(custom ? Number(custom.default_amount) : next === 'commission' ? 50 : next === 'booth_rent' ? 250 : next === 'hourly' ? 20 : 50000); }}><option value="commission">Service commission</option><option value="booth_rent">Weekly booth rent</option><option value="hourly">Hourly</option><option value="salary">Annual salary</option>{payModels.length > 0 && <optgroup label="Custom pay models">{payModels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select>
          </label>
          <label className="text-xs font-medium text-gray-600">{amountLabel}
            <input aria-label={amountLabel} type="number" min="0" step="0.01" className="mt-1.5 block w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-black shadow-sm" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
          <p className="max-w-md text-xs leading-5 text-gray-500">Changes apply from today forward. Previously logged pay periods keep their original rate.</p>
          <Button variant="solid" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save compensation'}</Button>
        </div>
      </div>
    </details>
  );
}

function WeeklyScheduleEditor({ locationStaffId, initial, onSaved }: { locationStaffId: string; initial: ScheduleDay[]; onSaved: () => void }) {
  const [days, setDays] = useState(() => DAY_LABELS.map((_, dayOfWeek) => {
    const existing = initial.find((day) => day.day_of_week === dayOfWeek);
    return { dayOfWeek, working: !!existing, startTime: existing?.start_time.slice(0, 5) ?? '09:00', endTime: existing?.end_time.slice(0, 5) ?? '17:00' };
  }));
  const save = useMutation({ mutationFn: () => api.put(`/settings/staff/${locationStaffId}/schedule`, days.filter((day) => day.working).map((day) => ({ dayOfWeek: day.dayOfWeek, startTime: day.startTime, endTime: day.endTime }))), onSuccess: onSaved });
  const invalid = days.some((day) => day.working && day.startTime >= day.endTime);
  return <Card className="overflow-hidden border-black/[0.07] bg-white/80 shadow-sm"><p className="border-b border-black/5 bg-[#fbfaf6] px-4 py-3 text-xs leading-5 text-gray-500">These are the employee’s usual weekly hours. Change a single date from Schedule without changing this pattern.</p>{days.map((day) => <div key={day.dayOfWeek} className={`grid grid-cols-[3rem_1fr] items-center gap-3 border-b border-black/5 px-4 py-3 text-sm transition-colors sm:grid-cols-[3rem_5rem_1fr_1fr] ${day.working ? 'bg-white/70' : 'bg-stone-50/40'}`}><strong className={day.working ? 'text-[#244a40]' : 'text-gray-500'}>{DAY_LABELS[day.dayOfWeek]}</strong><label className="flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={day.working} onChange={(event) => setDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, working: event.target.checked } : item))} />Working</label><input aria-label={`${DAY_LABELS[day.dayOfWeek]} start time`} type="time" disabled={!day.working} className="rounded-xl border border-black/10 bg-white px-3 py-2 shadow-sm disabled:bg-transparent disabled:shadow-none disabled:opacity-40" value={day.startTime} onChange={(event) => setDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, startTime: event.target.value } : item))} /><input aria-label={`${DAY_LABELS[day.dayOfWeek]} end time`} type="time" disabled={!day.working} className="rounded-xl border border-black/10 bg-white px-3 py-2 shadow-sm disabled:bg-transparent disabled:shadow-none disabled:opacity-40" value={day.endTime} onChange={(event) => setDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, endTime: event.target.value } : item))} /></div>)}<div className="flex items-center justify-between bg-[#fbfaf6] px-4 py-3">{invalid ? <span className="text-xs text-red-600">End time must be after start time.</span> : <span /> }<Button variant="solid" disabled={invalid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save weekly hours'}</Button></div></Card>;
}

function ComplianceFiles({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const files = useQuery({ queryKey: ['compliance-files', documentId], queryFn: () => api.get<ComplianceFile[]>(`/settings/compliance-documents/${documentId}/files`) });
  const upload = useMutation({
    mutationFn: (files: File[]) => Promise.all(files.map((file) => api.upload(`/settings/compliance-documents/${documentId}/files`, file))),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['compliance-files', documentId] }),
  });
  async function download(file: ComplianceFile) {
    const result = await api.download(`/settings/compliance-documents/${documentId}/files/${file.id}`);
    const url = URL.createObjectURL(result.blob);
    const anchor = window.document.createElement('a');
    anchor.href = url; anchor.download = result.filename ?? file.originalName; anchor.click();
    URL.revokeObjectURL(url);
  }
  async function view(file: ComplianceFile) {
    const result = await api.download(`/settings/compliance-documents/${documentId}/files/${file.id}/view`);
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return <div className="mt-2">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="cursor-pointer rounded-md border border-black/10 bg-white px-2 py-1 font-medium hover:border-black/30">{upload.isPending ? 'Uploading attachments…' : 'Attach files'}<input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip" disabled={upload.isPending} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) upload.mutate(files); event.target.value = ''; }} /></label>
      <span className="text-gray-400">Images, office documents, text, or ZIP · 25 MB each</span>
    </div>
    {upload.isError && <p className="mt-1 text-xs text-red-600">Upload failed. Check the file type and keep each attachment under 25 MB.</p>}
    {(files.data?.length ?? 0) > 0 && <div className="mt-2 space-y-1">{files.data!.map((file, index) => <div key={file.id} className="flex items-center justify-between gap-3 rounded-md bg-stone-50 px-2 py-1.5"><span className="min-w-0 truncate text-xs text-gray-600"><strong className="font-medium text-gray-800">{file.originalName}</strong><span className="ml-1 text-gray-400">· {fileKind(file)} · {formatFileSize(file.sizeBytes)} · version {files.data!.length - index} · {new Date(file.uploadedAt).toLocaleDateString()}</span></span><span className="flex shrink-0 gap-2">{canPreview(file) && <button className="text-xs font-medium hover:underline" onClick={() => void view(file)}>View</button>}<button className="text-xs text-gray-500 hover:underline" onClick={() => void download(file)}>Download</button></span></div>)}</div>}
  </div>;
}
