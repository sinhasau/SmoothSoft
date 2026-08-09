import { describe, expect, it } from 'vitest';
import { openingStaffingWarning } from './opening-staffing';

describe('openingStaffingWarning', () => {
  it('says nothing when somebody is already on the floor', () => {
    expect(openingStaffingWarning({ rosterCount: 4, onFloorCount: 1 })).toBeNull();
  });

  it('says nothing even with a single barber in on a quiet day', () => {
    expect(openingStaffingWarning({ rosterCount: 1, onFloorCount: 1 })).toBeNull();
  });

  describe('an empty roster — the setup problem that never surfaced', () => {
    const warning = openingStaffingWarning({ rosterCount: 0, onFloorCount: 0 })!;

    it('is flagged as blocking, because waiting will not fix it', () => {
      expect(warning.tone).toBe('blocking');
    });

    it('names the cause rather than the symptom', () => {
      expect(warning.headline).toMatch(/no barbers are assigned to this location/i);
    });

    it('says where to go, since the fix is not on this screen', () => {
      expect(warning.detail).toMatch(/staff/i);
    });

    it('warns that the queue will still accept walk-ins nobody can seat', () => {
      expect(warning.detail).toMatch(/walk-ins/i);
    });
  });

  describe('a populated roster with nobody clocked in — routine at opening', () => {
    const warning = openingStaffingWarning({ rosterCount: 5, onFloorCount: 0 })!;

    it('is only a caution — opening before the first barber arrives is normal', () => {
      expect(warning.tone).toBe('caution');
    });

    it('does not claim the location has no barbers', () => {
      expect(warning.headline).not.toMatch(/no barbers are assigned/i);
      expect(warning.headline).toMatch(/nobody is clocked in/i);
    });
  });

  it('tells the two empty-floor cases apart — they have different fixes', () => {
    const noRoster = openingStaffingWarning({ rosterCount: 0, onFloorCount: 0 })!;
    const noneIn = openingStaffingWarning({ rosterCount: 5, onFloorCount: 0 })!;
    expect(noRoster.tone).not.toBe(noneIn.tone);
    expect(noRoster.headline).not.toBe(noneIn.headline);
  });

  it('never blocks opening — it only ever returns advice', () => {
    // Deliberate: an owner opening twenty minutes before the first barber
    // arrives is normal, and refusing to open would be worse than the problem.
    for (const input of [
      { rosterCount: 0, onFloorCount: 0 },
      { rosterCount: 5, onFloorCount: 0 },
      { rosterCount: 5, onFloorCount: 2 },
    ]) {
      const result = openingStaffingWarning(input);
      expect(result === null || typeof result.detail === 'string').toBe(true);
    }
  });
});
