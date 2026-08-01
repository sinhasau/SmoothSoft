import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { freeLabel, StaffOutlook, unassignedReasonLabel, type StaffTimeline } from './staff-outlook';

const NOW = new Date('2026-07-22T14:00:00Z');

const timeline = (overrides: Partial<StaffTimeline> = {}): StaffTimeline => ({
  staffId: 's1',
  fullName: 'Alex Rivera',
  blocks: [],
  freeAt: NOW.toISOString(),
  ...overrides,
});

describe('freeLabel', () => {
  it('reads "open now" when the barber has nothing booked at all', () => {
    expect(freeLabel(timeline(), NOW)).toBe('open now');
  });

  it('reads "free now" when booked work has already run out', () => {
    const t = timeline({ blocks: [{ queueEntryId: 'e1', label: 'Sam', start: NOW.toISOString(), end: NOW.toISOString(), kind: 'walk_in' }] });
    expect(freeLabel(t, NOW)).toBe('free now');
  });

  it('reports sub-hour availability in minutes', () => {
    const t = timeline({
      blocks: [{ queueEntryId: 'e1', label: 'Sam', start: NOW.toISOString(), end: '2026-07-22T14:25:00Z', kind: 'walk_in' }],
      freeAt: '2026-07-22T14:25:00Z',
    });
    expect(freeLabel(t, NOW)).toBe('free in 25m');
  });

  it('reports longer availability in hours and minutes', () => {
    const t = timeline({
      blocks: [{ queueEntryId: 'e1', label: 'Sam', start: NOW.toISOString(), end: '2026-07-22T16:10:00Z', kind: 'walk_in' }],
      freeAt: '2026-07-22T16:10:00Z',
    });
    expect(freeLabel(t, NOW)).toBe('free in 2h 10m');
  });

  it('omits stray minutes on a whole-hour wait', () => {
    const t = timeline({
      blocks: [{ queueEntryId: 'e1', label: 'Sam', start: NOW.toISOString(), end: '2026-07-22T16:00:00Z', kind: 'walk_in' }],
      freeAt: '2026-07-22T16:00:00Z',
    });
    expect(freeLabel(t, NOW)).toBe('free in 2h');
  });
});

describe('unassignedReasonLabel', () => {
  it('explains a shift-end overflow', () => {
    expect(unassignedReasonLabel('past_shift_end')).toBe("won't fit in shift");
  });

  it('explains an empty floor', () => {
    expect(unassignedReasonLabel('no_eligible_staff')).toBe('no barber available');
  });
});

describe('StaffOutlook', () => {
  it('explains itself when nobody is clocked in, instead of vanishing', () => {
    // Staff default to `off`, so this is the state a fresh shop is in —
    // rendering nothing here reads as a broken feature.
    render(<StaffOutlook timelines={[]} unassigned={[]} now={NOW} />);
    expect(screen.getByRole('button', { name: /outlook/i })).toBeInTheDocument();
    expect(screen.getByText(/no one is clocked in yet/i)).toBeInTheDocument();
  });

  it('drops the empty-state note once a barber is on the floor', () => {
    render(<StaffOutlook timelines={[timeline()]} unassigned={[]} now={NOW} />);
    expect(screen.queryByText(/no one is clocked in yet/i)).not.toBeInTheDocument();
  });

  it('lists each on-floor barber with their booked work in order', () => {
    render(
      <StaffOutlook
        timelines={[
          timeline({
            blocks: [
              { queueEntryId: 'e1', label: 'Sam Chen', start: '2026-07-22T14:00:00Z', end: '2026-07-22T14:20:00Z', kind: 'in_service' },
              { queueEntryId: 'e2', label: 'Jordan Lee', start: '2026-07-22T14:20:00Z', end: '2026-07-22T14:45:00Z', kind: 'appointment' },
            ],
            freeAt: '2026-07-22T14:45:00Z',
          }),
        ]}
        unassigned={[]}
        timezone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Sam Chen'),
      expect.stringContaining('Jordan Lee'),
    ]);
  });

  it('marks the in-progress job and scheduled appointments distinctly', () => {
    render(
      <StaffOutlook
        timelines={[
          timeline({
            blocks: [
              { queueEntryId: 'e1', label: 'Sam Chen', start: '2026-07-22T14:00:00Z', end: '2026-07-22T14:20:00Z', kind: 'in_service' },
              { queueEntryId: 'e2', label: 'Jordan Lee', start: '2026-07-22T14:20:00Z', end: '2026-07-22T14:45:00Z', kind: 'appointment' },
              { queueEntryId: 'e3', label: 'Walk In', start: '2026-07-22T14:45:00Z', end: '2026-07-22T15:05:00Z', kind: 'walk_in' },
            ],
          }),
        ]}
        unassigned={[]}
        timezone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText('appt')).toBeInTheDocument();
  });

  it('shows the projected clock window for each block in the location timezone', () => {
    render(
      <StaffOutlook
        timelines={[
          timeline({
            blocks: [{ queueEntryId: 'e1', label: 'Sam Chen', start: '2026-07-22T14:00:00Z', end: '2026-07-22T14:20:00Z', kind: 'walk_in' }],
          }),
        ]}
        unassigned={[]}
        timezone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText('2:00 PM–2:20 PM')).toBeInTheDocument();
  });

  it('says so plainly when a barber on the floor has nothing booked', () => {
    render(<StaffOutlook timelines={[timeline()]} unassigned={[]} now={NOW} />);
    expect(screen.getByText('Nothing booked.')).toBeInTheDocument();
    expect(screen.getByText('open now')).toBeInTheDocument();
  });

  it('surfaces work no barber could take, with the reason, so staff can reseat it', () => {
    render(
      <StaffOutlook
        timelines={[]}
        unassigned={[
          { queueEntryId: 'e9', label: 'Taylor Reed', reason: 'no_eligible_staff' },
          { queueEntryId: 'e10', label: 'Casey Kim', reason: 'past_shift_end' },
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByText('Needs a chair')).toBeInTheDocument();
    expect(screen.getByText('Taylor Reed')).toBeInTheDocument();
    expect(screen.getByText('no barber available')).toBeInTheDocument();
    expect(screen.getByText('Casey Kim')).toBeInTheDocument();
    expect(screen.getByText("won't fit in shift")).toBeInTheDocument();
  });

  it('collapses and reopens the section', async () => {
    const user = userEvent.setup();
    render(<StaffOutlook timelines={[timeline()]} unassigned={[]} now={NOW} />);
    const toggle = screen.getByRole('button', { name: /outlook/i });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Alex Rivera')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
  });
});
