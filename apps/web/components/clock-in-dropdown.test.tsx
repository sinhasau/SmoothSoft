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

  it('does not split the list when nobody is scheduled today', async () => {
    // The regression this pins: on a Sunday — or at any shop that does not
    // keep weekly schedules current — nobody is scheduled, and splitting
    // unconditionally opened the menu onto an empty list with every real
    // barber buried behind "Not scheduled". A clock-in menu with no people in
    // it reads as broken.
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[
          staff('Marcus J.', { scheduledToday: false }),
          staff('Ray F.', { scheduledToday: false }),
        ]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.getByRole('button', { name: 'Marcus J.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ray F.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /not scheduled/i })).not.toBeInTheDocument();
  });

  it('still clocks someone in from that unsplit list', async () => {
    const user = userEvent.setup();
    const onClockIn = vi.fn();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.', { scheduledToday: false })]}
        onClockIn={onClockIn}
      />,
    );
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Marcus J.' }));
    expect(onClockIn).toHaveBeenCalledWith('marcusj');
  });

  it('splits only once there is a scheduled name to lead with', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[staff('Dee W.'), staff('Ray F.', { scheduledToday: false })]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.getByRole('button', { name: 'Dee W.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not scheduled (1)' })).toBeInTheDocument();
  });

  it('never opens onto an empty menu', async () => {
    // Whatever the schedule says, if the button is enabled there is at least
    // one person to tap.
    const user = userEvent.setup();
    for (const scheduledToday of [true, false, undefined]) {
      const { unmount } = render(
        <ClockInDropdown offStaff={[staff('Solo B.', { scheduledToday })]} onClockIn={vi.fn()} />,
      );
      await open(user);
      expect(screen.getByRole('button', { name: 'Solo B.' })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('ClockInDropdown — never disappears, and says why it is disabled', () => {
  it('stays visible but disabled when nobody is off the floor', () => {
    // It used to return null here, so someone hunting for the control while
    // the shop was fully staffed found nothing and assumed it did not exist.
    render(<ClockInDropdown offStaff={[]} onClockIn={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /clock in/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toBeDisabled();
  });

  it('says the roster is empty when the location has no staff at all', () => {
    // The real report this comes from: a store opened with no barbers
    // assigned. The control was disabled and claimed "Everyone on the roster
    // is already clocked in" — the exact opposite of the truth — which sent
    // someone hunting for a clock-in bug that did not exist.
    render(<ClockInDropdown offStaff={[]} rosterCount={0} onClockIn={vi.fn()} />);
    expect(screen.getByText(/no barbers on this location yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/already clocked in/i)).not.toBeInTheDocument();
  });

  it('says nothing when everyone is simply already on the floor', () => {
    // The strip beside this button already lists who is on the floor, so a
    // disabled control there explains itself. The old note said "Everyone is
    // already clocked in" — noise at best, and it appeared beside "No staff
    // clocked in yet" when the roster was hidden by a filter.
    render(<ClockInDropdown offStaff={[]} rosterCount={4} onClockIn={vi.fn()} />);
    expect(screen.queryByText(/already clocked in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no barbers on this location/i)).not.toBeInTheDocument();
  });

  it('explains itself in rendered text, not a title — titles never show on touch', () => {
    render(<ClockInDropdown offStaff={[]} rosterCount={0} onClockIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: /clock in/i })).not.toHaveAttribute('title');
  });

  it('stays quiet when it is usable', () => {
    render(<ClockInDropdown offStaff={[staff('Marcus J.')]} rosterCount={3} onClockIn={vi.fn()} />);
    expect(screen.queryByText(/no barbers on this location/i)).not.toBeInTheDocument();
  });

  it('does not open when there is nobody to pick', async () => {
    const user = userEvent.setup();
    render(<ClockInDropdown offStaff={[]} onClockIn={vi.fn()} />);
    await open(user);
    expect(screen.queryByRole('button', { name: /not scheduled/i })).not.toBeInTheDocument();
  });
});

describe('ClockInDropdown — nobody is ever silently dropped', () => {
  // The report this comes from: every barber at a location was marked
  // inactive, so a filter emptied the list, the button disabled itself, and
  // the message read "Everyone is already clocked in" directly beside a strip
  // saying "No staff clocked in yet". The owner could not put anyone on the
  // floor and had no way to find out why. Groupings are labelled reveals now,
  // never filters.

  it('keeps inactive staff reachable behind a labelled reveal', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.'), staff('Not Yet', { employmentStatus: 'inactive' })]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.queryByRole('button', { name: 'Not Yet' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not active (1)' }));
    expect(screen.getByRole('button', { name: 'Not Yet' })).toBeInTheDocument();
  });

  it('groups someone who has left the shop the same way', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[staff('Marcus J.'), staff('Gone G.', { employmentStatus: 'resigned' })]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Not active (1)' }));
    expect(screen.getByRole('button', { name: 'Gone G.' })).toBeInTheDocument();
  });

  it('stays usable when EVERY barber is inactive — the lockout case', async () => {
    const user = userEvent.setup();
    const onClockIn = vi.fn();
    render(
      <ClockInDropdown
        rosterCount={2}
        offStaff={[
          staff('Marcus J.', { employmentStatus: 'inactive' }),
          staff('Kim', { employmentStatus: 'inactive' }),
        ]}
        onClockIn={onClockIn}
      />,
    );
    const trigger = screen.getByRole('button', { name: /clock in/i });
    expect(trigger).toBeEnabled();
    expect(screen.queryByText(/already clocked in/i)).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Not active (2)' }));
    await user.click(screen.getByRole('button', { name: 'Kim' }));
    expect(onClockIn).toHaveBeenCalledWith('kim');
  });

  it('offers both reveals when the roster needs both', async () => {
    const user = userEvent.setup();
    render(
      <ClockInDropdown
        offStaff={[
          staff('Dee W.'),
          staff('Ray F.', { scheduledToday: false }),
          staff('Old Hand', { employmentStatus: 'resigned' }),
        ]}
        onClockIn={vi.fn()}
      />,
    );
    await open(user);
    expect(screen.getByRole('button', { name: 'Dee W.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not scheduled (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not active (1)' })).toBeInTheDocument();
  });

  it('is disabled ONLY when the roster genuinely has nobody off the floor', () => {
    // Every other reason for an empty-looking menu is a grouping decision, and
    // grouping must never disable the control.
    const cases: ClockInCandidate[][] = [
      [staff('A', { employmentStatus: 'inactive' })],
      [staff('B', { employmentStatus: 'resigned' })],
      [staff('C', { scheduledToday: false })],
    ];
    for (const offStaff of cases) {
      const { unmount } = render(<ClockInDropdown offStaff={offStaff} rosterCount={1} onClockIn={vi.fn()} />);
      expect(screen.getByRole('button', { name: /clock in/i })).toBeEnabled();
      unmount();
    }
    render(<ClockInDropdown offStaff={[]} rosterCount={1} onClockIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: /clock in/i })).toBeDisabled();
  });

  it('every person handed in is reachable, whatever their flags', async () => {
    // The invariant, stated once: grouping changes how many taps a name takes,
    // never whether it exists.
    const user = userEvent.setup();
    const people = [
      staff('Sched', { scheduledToday: true }),
      staff('Unsched', { scheduledToday: false }),
      staff('Inactive', { employmentStatus: 'inactive' }),
      staff('Resigned', { employmentStatus: 'resigned' }),
    ];
    render(<ClockInDropdown offStaff={people} rosterCount={4} onClockIn={vi.fn()} />);
    await open(user);
    for (const reveal of ['Not scheduled (1)', 'Not active (2)']) {
      const btn = screen.queryByRole('button', { name: reveal });
      if (btn) await user.click(btn);
    }
    for (const p of people) {
      expect(screen.getByRole('button', { name: p.fullName })).toBeInTheDocument();
    }
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
