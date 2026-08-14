'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Pill } from '../../../components/ui';
import { useOwnerDashboard } from '../use-owner-dashboard';
import { OwnerFallback } from '../owner-fallback';
import { ShopLink } from '../shop-link';

export default function OwnerTeamPage() {
  const dashboard = useOwnerDashboard();
  const { data } = dashboard;
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('all');
  const people = useMemo(() => (data?.team ?? []).filter((person) => (!query || person.fullName.toLowerCase().includes(query.toLowerCase())) && (location === 'all' || person.assignments.some((assignment) => assignment.locationId === location))), [data, location, query]);
  if (!data) return <OwnerFallback query={dashboard} what="the team" />;
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-8"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Organization</p><h1 className="mt-1 font-serif text-4xl">Team</h1><p className="mt-1 text-sm text-gray-500">One person per row, including every location assignment.</p></div><ShopLink locationId={data.locations[0]?.locationId} suffix="/staff" className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white" emptyReason="no locations yet">Add or manage staff</ShopLink></header><div className="flex flex-wrap gap-3"><input aria-label="Search team" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" className="min-w-56 flex-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"/><select aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"><option value="all">All locations</option>{data.locations.map((item) => <option key={item.locationId} value={item.locationId}>{item.locationName}</option>)}</select></div><Card><div className="hidden grid-cols-[1.3fr_.7fr_.7fr_1.4fr_auto] gap-4 border-b border-black/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid"><span>Person</span><span>Role</span><span>Class</span><span>Locations</span><span>Pay</span></div>{people.map((person) => { const primary = person.assignments.find((assignment) => assignment.isPrimary) ?? person.assignments[0]; return <Link key={person.userId} href={`/locations/${primary.locationId}/staff/${primary.locationStaffId}`} className="grid gap-2 border-b border-black/5 px-4 py-4 last:border-0 hover:bg-black/[0.02] md:grid-cols-[1.3fr_.7fr_.7fr_1.4fr_auto] md:items-center md:gap-4"><div><strong>{person.fullName}</strong><div className="text-xs text-gray-500">{person.employmentStatus}</div></div><span className="text-sm capitalize">{person.role.replace('_', ' ')}</span><Pill tone={person.classification === 'w2' ? 'gray' : 'amber'}>{(person.classification ?? 'unclassified').toUpperCase()}</Pill><div className="flex flex-wrap gap-1">{person.assignments.map((assignment) => <span key={assignment.locationStaffId} className="rounded-full bg-stone-100 px-2 py-1 text-xs">{assignment.locationName}</span>)}</div><span className={`text-xs font-medium ${primary.compensationModel === 'not_configured' ? 'text-amber-700' : 'text-gray-600'}`}>{formatPay(primary)}</span></Link>; })}{people.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No team members match these filters.</div>}</Card></div>;
}

function formatPay(assignment: { compensationModel: string; commissionPct: number | null; boothRentWeekly: number | null; hourlyRate: number | null; annualSalary: number | null }) {
  if (assignment.compensationModel === 'commission') return `${assignment.commissionPct ?? 0}% commission`;
  if (assignment.compensationModel === 'booth_rent') return `$${assignment.boothRentWeekly ?? 0}/week rent`;
  if (assignment.compensationModel === 'hourly') return `$${assignment.hourlyRate ?? 0}/hour`;
  if (assignment.compensationModel === 'salary') return `$${(assignment.annualSalary ?? 0).toLocaleString()}/year`;
  return assignment.compensationModel === 'not_configured' ? 'Setup needed' : assignment.compensationModel;
}
