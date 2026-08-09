import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClockInDropdown, type ClockInCandidate } from './ui';

const staff = (
  fullName: string,
  extra: Partial<ClockInCandidate> = {},
): ClockInCandidate => ({
  locationStaffId: fullName.toLowerCase().replace(/\W/g, ''),
  fullName,
  scheduledToday: true,
  employmentStatus: 'active',
  ...extra,
});

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /clock in/i }));

describe('ClockInDropdown — scheduled staff first', () => {
  it('lists people scheduled today without any extra tap', async () => {
    const user = userEvent.setup();
    render(<ClockInDropdown offStaff={[staff('Marcus J.')]} onClockIn={vi.fn()} />);
    await open(user);
    expect(screen.getByRole('button', { name: 'Marcus J.' })).toBeInTheDocument();
  });

  it('keeps unscheduled staff behind a button, out of the main flow', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.'), staff('Ray F.', { scheduledToday: false })]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.queryByRole('button', { name: 'Ray F.' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not scheduled (1)' })).toBeInTheDocument();
  });

  it('reveals them when that button is tapped, so filling in is always possible', async () => {
    const user = userEvent.setup();
    const onClockIn = vi.fn();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.'), staff('Ray F.', { scheduledToday: false })]}
        onClockIn={onClockIn}
      />,
    );
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Not scheduled (1)' }));
    await user.click(screen.getByRole('button', { name: 'Ray F.' }));
    expect(onClockIn).toHaveBeenCalledWith('rayf');
  });

  it('says so plainly when everyone scheduled is already on the floor', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown offStaff={[staff('Ray F.', { scheduledToday: false })]} onClockIn={vi.fn()} />,
    );
    await open(user);
    expect(screen.getByText(/nobody scheduled today is off the floor/i)).toBeInTheDocument();
    // The fill-in path is still one tap away — that is the whole point.
    expect(screen.getByRole('button', { name: 'Not scheduled (1)' })).toBeInTheDocument();
  });
});

describe('ClockInDropdown — never disappears', () => {
  it('stays visible but disabled when nobody is off the floor', () => {
    // It used to return null here, so someone hunting for the control while
    // the shop was fully staffed found nothing and assumed it did not exist.
    render(<ClockInDropdown offStaff={[]} onClockIn={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /clock in/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toBeDisabled();
  });

  it('does not open when there is nobody to pick', async () => {
    const user = userEvent.setup();
    render(<ClockInDropdown offStaff={[]} onClockIn={vi.fn()} />);
    await open(user);
    expect(screen.queryByRole('button', { name: /not scheduled/i })).not.toBeInTheDocument();
  });
});

describe('ClockInDropdown — who is offered', () => {
  it('leaves out staff who have left the shop', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.'), staff('Gone G.', { employmentStatus: 'resigned' })]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.queryByRole('button', { name: 'Gone G.' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcus J.' })).toBeInTheDocument();
  });

  it('leaves out inactive / pre-hire staff too', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.'), staff('Not Yet', { employmentStatus: 'inactive' })]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.queryByRole('button', { name: 'Not Yet' })).not.toBeInTheDocument();
  });
});

describe('ClockInDropdown — tolerates an older API build', () => {
  // Both fields are new. During a deploy the previous API is still serving, so
  // a response without them must not empty the list or strand everyone behind
  // a "Not scheduled" button that looks broken.
  const legacy = (fullName: string) => ({
    locationStaffId: fullName.toLowerCase().replace(/\W/g, ''),
    fullName,
  });

  it('shows everyone in the main list when no schedule data is present', async () => {
    const user = userEvent.setup();
    render(<ClockInDropdown offStaff={[legacy('Marcus J.'), legacy('Ray F.')]} onClockIn={vi.fn()} />);
    await open(user);
    expect(screen.getByRole('button', { name: 'Marcus J.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ray F.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /not scheduled/i })).not.toBeInTheDocument();
  });

  it('treats a missing employmentStatus as active rather than hiding the person', async () => {
    const user = userEvent.setup();
    render(<ClockInDropdown offStaff={[legacy('Marcus J.')]} onClockIn={vi.fn()} />);
    await open(user);
    expect(screen.getByRole('button', { name: 'Marcus J.' })).toBeInTheDocument();
  });
});

describe('ClockInDropdown — usable with a thumb', () => {
  it('gives the trigger and every row a 44px minimum target', async () => {
    const user = userEvent.setup();
    render(<ClockInDropdown offStaff={[staff('Marcus J.')]} onClockIn={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /clock in/i });
    expect(trigger.className).toContain('min-h-11');
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Marcus J.' }).className).toContain('min-h-11');
  });
});
