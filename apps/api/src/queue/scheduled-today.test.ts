import { describe, expect, it } from 'vitest';
import { scheduledTodayStaffIds } from './scheduled-today';

const weekly = (...ids: string[]) => ids.map((location_staff_id) => ({ location_staff_id }));

describe('scheduledTodayStaffIds — who the shop expects today', () => {
  it('uses the weekly pattern when nothing overrides it', () => {
    const scheduled = scheduledTodayStaffIds([], weekly('marcus', 'dee'));
    expect([...scheduled].sort()).toEqual(['dee', 'marcus']);
  });

  it('is empty when nobody is scheduled', () => {
    expect(scheduledTodayStaffIds([], []).size).toBe(0);
  });

  describe('a date-specific exception beats the weekly pattern, both ways', () => {
    it('adds someone covering a shift they do not normally work', () => {
      const scheduled = scheduledTodayStaffIds(
        [{ location_staff_id: 'ray', is_working: true }],
        weekly('marcus'),
      );
      expect(scheduled.has('ray')).toBe(true);
      expect(scheduled.has('marcus')).toBe(true);
    });

    it('removes someone on approved time off from their normal day', () => {
      // The bug this pins: reading the weekly pattern first would put someone
      // on leave at the top of the clock-in list, and bury whoever is covering.
      const scheduled = scheduledTodayStaffIds(
        [{ location_staff_id: 'marcus', is_working: false }],
        weekly('marcus', 'dee'),
      );
      expect(scheduled.has('marcus')).toBe(false);
      expect(scheduled.has('dee')).toBe(true);
    });

    it('keeps a not-working exception decisive even with no weekly shift', () => {
      const scheduled = scheduledTodayStaffIds(
        [{ location_staff_id: 'ray', is_working: false }],
        weekly(),
      );
      expect(scheduled.has('ray')).toBe(false);
    });
  });

  it('does not care what order the rows arrive in', () => {
    const exceptions = [
      { location_staff_id: 'dee', is_working: false },
      { location_staff_id: 'ray', is_working: true },
    ];
    const forward = scheduledTodayStaffIds(exceptions, weekly('marcus', 'dee'));
    const backward = scheduledTodayStaffIds([...exceptions].reverse(), weekly('dee', 'marcus'));
    expect([...forward].sort()).toEqual([...backward].sort());
    expect([...forward].sort()).toEqual(['marcus', 'ray']);
  });

  it('tolerates a staff member appearing twice in the weekly pattern', () => {
    // A split shift is two rows for the same person on the same weekday.
    const scheduled = scheduledTodayStaffIds([], weekly('marcus', 'marcus'));
    expect([...scheduled]).toEqual(['marcus']);
  });
});
