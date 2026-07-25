'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { Button, Card, Pill } from '../../../../components/ui';

type ComplaintStatus = 'new' | 'acknowledged' | 'resolved';
type Complaint = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  message: string;
  status: ComplaintStatus;
  createdAt: string;
  resolvedAt: string | null;
  clientId: string | null;
  clientProfileName: string | null;
  handledByName: string | null;
};
type Feed = { complaints: Complaint[]; counts: Record<ComplaintStatus, number> };

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ComplaintsPage({ params }: { params: { locationId: string } }) {
  const queryClient = useQueryClient();
  // Live feed — polls so new complaints surface "as they emerge".
  const feed = useQuery({ queryKey: ['complaints'], queryFn: () => api.get<Feed>('/complaints'), refetchInterval: 15_000 });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ComplaintStatus }) => api.post(`/complaints/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints'] }),
  });

  const rows = feed.data?.complaints ?? [];
  const counts = feed.data?.counts ?? { new: 0, acknowledged: 0, resolved: 0 };
  const feedbackUrl = `/feedback/${params.locationId}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b6f47]">Make it right</p>
          <h1 className="text-3xl font-semibold tracking-tight">Complaints</h1>
          <p className="mt-1 text-sm text-gray-500">Customer feedback as it comes in. Acknowledge it, then resolve once it’s handled.</p>
        </div>
        {/* Staff can open the customer-facing form directly (share the link, or fill it at the desk). */}
        <Link href={feedbackUrl} target="_blank" className="rounded-xl bg-[#315c4f] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#274c40]">Open customer form ↗</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill tone={counts.new ? 'red' : 'gray'}>{counts.new} new</Pill>
        <Pill tone={counts.acknowledged ? 'amber' : 'gray'}>{counts.acknowledged} acknowledged</Pill>
        <Pill tone="green">{counts.resolved} resolved</Pill>
      </div>

      <div className="space-y-3">
        {feed.isLoading && <Card className="p-8 text-center text-sm text-gray-400">Loading feedback…</Card>}
        {feed.isError && <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">Couldn’t load complaints. You may not have access to this view.</Card>}
        {!feed.isLoading && !feed.isError && rows.length === 0 && (
          <Card className="p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7eee9] text-xl text-[#315c4f]">💬</div>
            <p className="mt-4 font-medium text-[#20342d]">No complaints yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">When a customer submits the feedback form, it shows up here right away. Share the <Link href={feedbackUrl} target="_blank" className="underline">customer form</Link>.</p>
          </Card>
        )}
        {rows.map((row) => {
          const pending = setStatus.isPending && setStatus.variables?.id === row.id;
          return (
            <Card key={row.id} className={`p-4 ${row.status === 'new' ? 'border-red-200/70 bg-red-50/40' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.clientId ? (
                      <Link href={`/locations/${params.locationId}/clients/${row.clientId}`} className="font-semibold text-[#244a40] hover:underline">{row.clientProfileName ?? row.customerName}</Link>
                    ) : (
                      <span className="font-semibold text-[#20342d]">{row.customerName}</span>
                    )}
                    {row.customerPhone && <span className="text-xs text-gray-400">{row.customerPhone}</span>}
                    <Pill tone={row.status === 'new' ? 'red' : row.status === 'acknowledged' ? 'amber' : 'green'}>{row.status}</Pill>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{row.message}</p>
                  <div className="mt-2 text-xs text-gray-400">
                    {timeAgo(row.createdAt)} · {new Date(row.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {row.status === 'resolved' && row.handledByName && <> · resolved by {row.handledByName}</>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {row.status === 'new' && <Button disabled={pending} onClick={() => setStatus.mutate({ id: row.id, status: 'acknowledged' })}>Acknowledge</Button>}
                  {row.status !== 'resolved' && <Button variant="solid" disabled={pending} onClick={() => setStatus.mutate({ id: row.id, status: 'resolved' })}>Resolve</Button>}
                  {row.status === 'resolved' && <Button disabled={pending} onClick={() => setStatus.mutate({ id: row.id, status: 'new' })}>Reopen</Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
