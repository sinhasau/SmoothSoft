'use client';

import { useState } from 'react';
import { Card } from '../../../../components/ui';

export interface TimelineBlock {
  queueEntryId: string;
  label: string;
  start: string;
  end: string;
  kind: 'in_service' | 'appointment' | 'walk_in';
}

export interface StaffTimeline {
  staffId: string;
  fullName: string;
  blocks: TimelineBlock[];
  freeAt: string;
}

export interface UnassignedEntry {
  queueEntryId: string;
  label: string;
  reason: 'no_eligible_staff' | 'past_shift_end';
}

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function freeLabel(timeline: StaffTimeline, now: Date): string {
  if (timeline.blocks.length === 0) return 'open now';
  const minutes = minutesBetween(now, new Date(timeline.freeAt));
  if (minutes === 0) return 'free now';
  if (minutes < 60) return `free in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `free in ${hours}h${rest ? ` ${rest}m` : ''}`;
}

export function unassignedReasonLabel(reason: UnassignedEntry['reason']): string {
  return reason === 'past_shift_end' ? "won't fit in shift" : 'no barber available';
}

/**
 * Per-barber projected day. Only barbers actually on the floor appear — the
 * projection follows live clock status, not the published roster, so a
 * barber who clocks out drops off here on the next board refresh and their
 * remaining work reappears in "Needs a chair" for staff to reseat by hand.
 */
export function StaffOutlook({
  timelines,
  unassigned,
  timezone,
  now,
}: {
  timelines: StaffTimeline[];
  unassigned: UnassignedEntry[];
  timezone?: string;
  now: Date;
}) {
  const [open, setOpen] = useState(true);
  if (timelines.length === 0 && unassigned.length === 0) return null;

  const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timezone });

  return (
    <div>
      <button
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span> Outlook — projected day
      </button>
      {open && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {timelines.map((timeline) => (
            <Card key={timeline.staffId} className="p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <strong className="truncate text-sm">{timeline.fullName}</strong>
                <span className="shrink-0 text-xs text-gray-500">{freeLabel(timeline, now)}</span>
              </div>
              {timeline.blocks.length === 0 ? (
                <p className="text-sm text-gray-400">Nothing booked.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {timeline.blocks.map((block) => (
                    <li key={block.queueEntryId} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className={`h-6 w-1 shrink-0 rounded-full ${
                          block.kind === 'in_service' ? 'bg-[#c98310]' : block.kind === 'appointment' ? 'bg-[#315c4f]' : 'bg-[#cfded7]'
                        }`}
                      />
                      <span className="w-24 shrink-0 tabular-nums text-xs text-gray-500">
                        {clock(block.start)}–{clock(block.end)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{block.label}</span>
                      {block.kind === 'in_service' && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#c98310]">now</span>}
                      {block.kind === 'appointment' && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#315c4f]">appt</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}
          {unassigned.length > 0 && (
            <Card className="border-[#e0c9b8] p-4">
              <strong className="mb-2 block text-sm text-[#8c4f26]">Needs a chair</strong>
              <ul className="flex flex-col gap-1.5">
                {unassigned.map((entry) => (
                  <li key={entry.queueEntryId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <span className="shrink-0 text-xs text-gray-500">{unassignedReasonLabel(entry.reason)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
