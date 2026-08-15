'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Card, Pill } from '../../../components/ui';
import { Modal } from '../../../components/modal';
import { useOwnerDashboard } from '../use-owner-dashboard';
import { OwnerFallback } from '../owner-fallback';
import { ShopLink } from '../shop-link';
import type { OwnerAssignment, OwnerPerson, StaffContact } from '../org-types';

export default function OwnerTeamPage() {
  const dashboard = useOwnerDashboard();
  const { data } = dashboard;
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('all');
  const [editing, setEditing] = useState<OwnerPerson | null>(null);

  const people = useMemo(
    () =>
      (data?.team ?? []).filter(
        (person) =>
          (!query || person.fullName.toLowerCase().includes(query.toLowerCase())) &&
          (location === 'all' || person.assignments.some((a) => a.locationId === location)),
      ),
    [data, location, query],
  );

  if (!data) return <OwnerFallback query={dashboard} what="the team" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Organization</p>
          <h1 className="mt-1 font-serif text-4xl">Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            One person per card, with every location assignment shown separately — role and pay class belong to the
            assignment, not the person.
          </p>
        </div>
        <ShopLink
          locationId={data.locations[0]?.locationId}
          suffix="/staff"
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white"
          emptyReason="no locations yet"
        >
          Add or manage staff
        </ShopLink>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search team"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="min-h-11 min-w-56 flex-1 rounded-lg border border-black/15 bg-white px-3 text-sm"
        />
        <select
          aria-label="Filter by location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="min-h-11 rounded-lg border border-black/15 bg-white px-3 text-sm"
        >
          <option value="all">All locations</option>
          {data.locations.map((item) => (
            <option key={item.locationId} value={item.locationId}>
              {item.locationName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3">
        {people.map((person) => (
          <PersonCard key={person.userId} person={person} onEdit={() => setEditing(person)} />
        ))}
        {people.length === 0 && (
          <Card>
            <div className="px-4 py-8 text-center text-sm text-gray-500">No team members match these filters.</div>
          </Card>
        )}
      </div>

      {editing && <ContactModal person={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonCard({ person, onEdit }: { person: OwnerPerson; onEdit: () => void }) {
  const primary = person.assignments.find((a) => a.isPrimary) ?? person.assignments[0];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-base">{person.fullName}</strong>
            {/* Only claim a single status when every assignment agrees. */}
            {person.mixedEmploymentStatus ? (
              <Pill tone="amber">status differs by shop</Pill>
            ) : (
              <span className="text-xs text-gray-500">{person.employmentStatus}</span>
            )}
            {person.mixedClassification && <Pill tone="red">pay class differs by shop</Pill>}
          </div>
          <ContactLine contact={primary?.contact} />
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 shrink-0 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium hover:border-black/40"
        >
          Edit contact
        </button>
      </div>

      <div className="mt-3 grid gap-2 border-t border-black/5 pt-3">
        {person.assignments.map((a) => (
          <AssignmentRow key={a.locationStaffId} assignment={a} />
        ))}
      </div>
    </Card>
  );
}

/**
 * One row per assignment. This is the whole point of the card: role and
 * classification are per (location, person) in the schema, and collapsing them
 * onto the person previously showed whichever location sorted first — which
 * could report a 1099 barber as W-2 at the shop that actually pays them.
 */
function AssignmentRow({ assignment }: { assignment: OwnerAssignment }) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[1.4fr_.8fr_.6fr_auto] sm:items-center sm:gap-3">
      <Link href={`/locations/${assignment.locationId}/staff/${assignment.locationStaffId}`} className="font-medium hover:underline">
        {assignment.locationName}
        {assignment.isPrimary && <span className="ml-2 text-xs font-normal text-[#8b6f47]">home shop</span>}
      </Link>
      <span className="capitalize text-gray-600">{assignment.role.replace('_', ' ')}</span>
      <Pill tone={assignment.classification === 'w2' ? 'gray' : 'amber'}>
        {(assignment.classification ?? 'unclassified').toUpperCase()}
      </Pill>
      <span className="text-xs text-gray-500">
        {assignment.floorStatus === 'off' ? 'off' : `on the floor · ${assignment.floorStatus}`}
      </span>
    </div>
  );
}

function ContactLine({ contact }: { contact?: StaffContact | null }) {
  // null means withheld by the visibility rule; an object of nulls means we
  // simply have nothing on file. Those are different sentences.
  if (contact === null || contact === undefined) {
    return <p className="mt-1 text-xs text-gray-400">Contact details are not visible to you.</p>;
  }
  const parts = [contact.phone, contact.email].filter(Boolean);
  const address = [contact.addressLine1, contact.city, contact.region, contact.postalCode].filter(Boolean).join(', ');
  if (parts.length === 0 && !address) {
    return <p className="mt-1 text-xs text-amber-700">No phone or address on file — needed for payroll filing.</p>;
  }
  return (
    <p className="mt-1 text-xs text-gray-500">
      {parts.join(' · ')}
      {address && <span className="block">{address}</span>}
    </p>
  );
}

const FIELDS: Array<{ key: keyof StaffContact; label: string; type?: string }> = [
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'addressLine1', label: 'Address' },
  { key: 'addressLine2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State / region' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'emergencyContactName', label: 'Emergency contact' },
  { key: 'emergencyContactPhone', label: 'Emergency phone', type: 'tel' },
];

function ContactModal({ person, onClose }: { person: OwnerPerson; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = person.assignments.find((a) => a.contact)?.contact ?? null;
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, (existing?.[f.key] as string | null) ?? ''])),
  );

  const save = useMutation({
    mutationFn: () => api.put(`/staff-contact/${person.userId}`, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'org'] });
      onClose();
    },
  });

  return (
    <Modal onClose={onClose} label={`Contact details — ${person.fullName}`} size="md">
      <h2 className="font-serif text-2xl">Contact details</h2>
      <p className="mt-1 text-sm text-gray-500">{person.fullName}</p>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Used for payroll filing and for reaching someone in an emergency. Visible to you as owner, and to a manager at
        the shops this person works in — not to colleagues.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="text-xs font-medium text-gray-600">
            {field.label}
            <input
              type={field.type ?? 'text'}
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
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-black/15 bg-white px-4 text-sm font-medium">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="min-h-11 rounded-lg bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save contact details'}
        </button>
      </div>
    </Modal>
  );
}
