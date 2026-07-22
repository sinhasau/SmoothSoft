import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { isUndoShortcut, PublishReview, ScheduleUndoButton, ShiftContextMenu, staffingCoverageLabel } from './schedule-components';

describe('schedule power-user actions', () => {
  it('shows the staffing minimum only when the day is below target', () => {
    expect(staffingCoverageLabel(6, 2)).toBe('6 staff scheduled');
    expect(staffingCoverageLabel(1, 2)).toBe('1 staff scheduled · minimum target 2');
  });

  it('recognizes Control/Command+Z without intercepting redo', () => {
    expect(isUndoShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'z' })).toBe(true);
    expect(isUndoShortcut({ ctrlKey: false, metaKey: true, shiftKey: false, key: 'Z' })).toBe(true);
    expect(isUndoShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'z' })).toBe(false);
  });

  it('runs the visible undo action and honors its pending state', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const { rerender } = render(<ScheduleUndoButton pending={false} onUndo={onUndo} />);
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledOnce();
    rerender(<ScheduleUndoButton pending onUndo={onUndo} />);
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('offers complete shift actions and invokes each available action', async () => {
    const user = userEvent.setup();
    const actions = {
      onClose: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onCopy: vi.fn(),
      onPaste: vi.fn(), onDelete: vi.fn(),
    };
    render(<ShiftContextMenu state={{ staffId: 'staff-1', fullName: 'Alex Lane', date: '2026-07-21', x: 10, y: 10, entry: { working: true } }} copied {...actions} />);

    await user.click(screen.getByRole('menuitem', { name: /edit shift/i }));
    await user.click(screen.getByRole('menuitem', { name: /duplicate/i }));
    await user.click(screen.getByRole('menuitem', { name: /copy shift/i }));
    await user.click(screen.getByRole('menuitem', { name: /paste shift/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove shift/i }));

    expect(actions.onEdit).toHaveBeenCalledOnce();
    expect(actions.onDuplicate).toHaveBeenCalledOnce();
    expect(actions.onCopy).toHaveBeenCalledOnce();
    expect(actions.onPaste).toHaveBeenCalledOnce();
    expect(actions.onDelete).toHaveBeenCalledOnce();
  });

  it('keeps paste unavailable until a shift has been copied', () => {
    render(<ShiftContextMenu state={{ staffId: 'staff-1', fullName: 'Alex Lane', date: '2026-07-21', x: 10, y: 10 }} copied={false} onClose={vi.fn()} onEdit={vi.fn()} onDuplicate={vi.fn()} onCopy={vi.fn()} onPaste={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('menuitem', { name: /paste shift/i })).toBeDisabled();
    expect(screen.queryByRole('menuitem', { name: /remove shift/i })).not.toBeInTheDocument();
  });

  it('reviews publication impact and supports notification scope selection', async () => {
    const user = userEvent.setup();
    const onNotifyScope = vi.fn();
    const onPublish = vi.fn();
    const onClose = vi.fn();
    render(<PublishReview dirtyCount={4} issueCount={2} activeCount={7} notifyScope="all" published onNotifyScope={onNotifyScope} onClose={onClose} onPublish={onPublish} pending={false} />);

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/only affected employees/i));
    await user.click(screen.getByRole('button', { name: /publish with 2 issues/i }));
    await user.click(screen.getByRole('button', { name: /keep editing/i }));

    expect(onNotifyScope).toHaveBeenCalledWith('affected');
    expect(onPublish).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
