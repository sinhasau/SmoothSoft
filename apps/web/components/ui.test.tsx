import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, ClockInDropdown, RowMenu, StatusDropdown } from './ui';

describe('shared action controls', () => {
  it('runs a primary button action once and honors disabled state', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const { rerender } = render(<Button onClick={action}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(action).toHaveBeenCalledOnce();
    rerender(<Button onClick={action} disabled>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('opens a row menu, invokes its action, and closes', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<RowMenu items={[{ label: 'Reassign', onClick: action }]} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('button', { name: 'Reassign' }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Reassign' })).not.toBeInTheDocument();
  });

  it('changes staff status but does not open while busy', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const { rerender } = render(<StatusDropdown status="available" onChange={change} />);
    await user.click(screen.getByRole('button', { name: /available/i }));
    await user.click(screen.getByRole('button', { name: 'Break' }));
    expect(change).toHaveBeenCalledWith('break');
    rerender(<StatusDropdown status="busy" onChange={change} />);
    await user.click(screen.getByRole('button', { name: /busy/i }));
    expect(screen.queryByRole('button', { name: 'Off' })).not.toBeInTheDocument();
  });

  it('clocks in the selected professional and closes the list', async () => {
    const user = userEvent.setup();
    const clockIn = vi.fn();
    render(<ClockInDropdown offStaff={[{ locationStaffId: 'ls-1', fullName: 'Avery Lane' }]} onClockIn={clockIn} />);
    await user.click(screen.getByRole('button', { name: /clock in/i }));
    await user.click(screen.getByRole('button', { name: 'Avery Lane' }));
    expect(clockIn).toHaveBeenCalledWith('ls-1');
    expect(screen.queryByRole('button', { name: 'Avery Lane' })).not.toBeInTheDocument();
  });
});
