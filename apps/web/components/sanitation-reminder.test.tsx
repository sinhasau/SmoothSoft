import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SanitationReminder, type SanitationReminderState } from './sanitation-reminder';

const due: SanitationReminderState = { enabled: true, intervalHours: 2, nextDueAt: '2026-07-21T12:00:00Z', due: true, snoozed: false, lastCompletedAt: null };

describe('SanitationReminder', () => {
  it('supports ten-minute snooze and completion', async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn();
    const onComplete = vi.fn();
    render(<SanitationReminder state={due} pending={false} onSnooze={onSnooze} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: /snooze 10 min/i }));
    await user.click(screen.getByRole('button', { name: /mark done/i }));
    expect(onSnooze).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('stays out of the interface when disabled', () => {
    render(<SanitationReminder state={{ ...due, enabled: false }} pending={false} onSnooze={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
