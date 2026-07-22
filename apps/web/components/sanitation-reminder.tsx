'use client';

import { Button } from './ui';

export interface SanitationReminderState {
  enabled: boolean;
  intervalHours: number;
  nextDueAt: string | null;
  due: boolean;
  snoozed: boolean;
  lastCompletedAt: string | null;
}

export function SanitationReminder({ state, pending, onSnooze, onComplete }: {
  state: SanitationReminderState | undefined;
  pending: boolean;
  onSnooze: () => void;
  onComplete: () => void;
}) {
  if (!state?.enabled) return null;
  if (!state.due) {
    if (!state.snoozed || !state.nextDueAt) return null;
    return <div role="status" className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900"><span>Sanitation check snoozed until {new Date(state.nextDueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</span></div>;
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div><strong className="block text-sm text-amber-950">Sanitation check due</strong><span className="text-xs text-amber-800">Clean and disinfect tools, chairs, and work surfaces, then record completion.</span></div>
      <div className="flex shrink-0 gap-2"><Button onClick={onSnooze} disabled={pending}>Snooze 10 min</Button><Button variant="solid" onClick={onComplete} disabled={pending}>Mark done</Button></div>
    </div>
  );
}
