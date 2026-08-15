'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Card, Pill } from '../../../components/ui';
import { Modal } from '../../../components/modal';
import { useOwnerDashboard } from '../use-owner-dashboard';
import { OwnerFallback } from '../owner-fallback';
import type { OwnerLocation } from '../org-types';

export default function OwnerLocationsPage() {
  const dashboard = useOwnerDashboard();
  const { data } = dashboard;
  const [editing, setEditing] = useState<OwnerLocation | null>(null);
  if (!data) return <OwnerFallback query={dashboard} what="your locations" />;
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-8"><header><p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Organization</p><h1 className="mt-1 font-serif text-4xl">Locations</h1><p className="mt-1 text-sm text-gray-500">Choose a shop to operate it, or compare today at a glance.</p></header><div className="grid gap-4 lg:grid-cols-2">{data.locations.map((location) => <Card key={location.locationId} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl">{location.locationName}</h2><p className="mt-1 text-sm text-gray-500">{location.staffTotal} staff · {location.clientsServed} clients today</p></div><Pill tone={location.complianceStatus === 'compliant' ? 'green' : location.complianceStatus === 'overdue' ? 'red' : 'amber'}>{location.complianceStatus.replace('_', ' ')}</Pill></div><div className="mt-5 grid grid-cols-3 gap-3 border-y border-black/5 py-4 text-center"><div><strong className="block text-xl">${location.revenue.toFixed(0)}</strong><span className="text-xs text-gray-500">Revenue</span></div><div><strong className="block text-xl">{location.staffOnShift}/{location.staffTotal}</strong><span className="text-xs text-gray-500">On shift</span></div><div><strong className="block text-xl">{location.pendingScheduleRequests}</strong><span className="text-xs text-gray-500">Requests</span></div></div><AddressBlock location={location} onEdit={() => setEditing(location)} /><div className="mt-4 flex flex-wrap gap-2"><Link href={`/locations/${location.locationId}`} className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Open dashboard</Link><Link href={`/locations/${location.locationId}/schedule`} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium">Schedule</Link><Link href={`/locations/${location.locationId}/reports`} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium">Reports</Link></div></Card>)}</div>{editing && <AddressModal location={editing} onClose={() => setEditing(null)} />}</div>;
}

/**
 * A shop's public address. Unlike a staff home address this is not restricted
 * reading — it belongs on receipts and booking pages — but only an owner may
 * change it, since adding and configuring locations sits outside a manager's
 * scope.
 */
function AddressBlock({ location, onEdit }: { location: OwnerLocation; onEdit: () => void }) {
  const a = location.address;
  const lines = a ? [a.addressLine1, a.addressLine2, [a.city, a.region, a.postalCode].filter(Boolean).join(' ')].filter(Boolean) : [];
  return (
    <div className="mt-4 rounded-xl bg-stone-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          {lines.length > 0 ? (
            <>
              {lines.map((line) => <div key={line}>{line}</div>)}
              {a?.phone && <div className="mt-1 text-xs text-gray-500">{a.phone}</div>}
            </>
          ) : (
            // Not a neutral empty state: an address is needed for receipts, a
            // map link, and as the jurisdiction anchor for this shop's tax rate.
            <p className="text-xs text-amber-700">No address on file — needed for receipts and directions.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 shrink-0 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium hover:border-black/40"
        >
          {lines.length > 0 ? 'Edit address' : 'Add address'}
        </button>
      </div>
    </div>
  );
}

const ADDRESS_FIELDS = [
  { key: 'addressLine1', label: 'Address' },
  { key: 'addressLine2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State / region' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'phone', label: 'Shop phone', type: 'tel' },
] as const;

function AddressModal({ location, onClose }: { location: OwnerLocation; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(ADDRESS_FIELDS.map((f) => [f.key, (location.address?.[f.key] as string | null) ?? ''])),
  );
  const save = useMutation({
    mutationFn: () => api.put(`/org/locations/${location.locationId}/address`, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'org'] });
      onClose();
    },
  });

  return (
    <Modal onClose={onClose} label={`Address — ${location.locationName}`} size="md">
      <h2 className="font-serif text-2xl">Shop address</h2>
      <p className="mt-1 text-sm text-gray-500">{location.locationName}</p>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Public-facing: this appears on receipts and booking pages, and anchors the sales-tax rate to a jurisdiction.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ADDRESS_FIELDS.map((field) => (
          <label key={field.key} className="text-xs font-medium text-gray-600">
            {field.label}
            <input
              type={'type' in field ? field.type : 'text'}
              value={form[field.key] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm font-normal"
            />
          </label>
        ))}
      </div>
      {save.isError && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-700">
          Could not save: {save.error instanceof Error ? save.error.message : 'unknown error'}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-black/15 bg-white px-4 text-sm font-medium">Cancel</button>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="min-h-11 rounded-lg bg-black px-4 text-sm font-medium text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save address'}
        </button>
      </div>
    </Modal>
  );
}
