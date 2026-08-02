import { describe, expect, it } from 'vitest';
import { isLate, LATE_GRACE_MINUTES, latenessLabel, minutesPastPromise } from './lateness';

const NOW = new Date('2026-08-02T15:00:00Z');
const walkIn = (estimatedStart: string | null, lateArrival = false) => ({ isAppt: false, apptAt: null, estimatedStart, lateArrival });
const appt = (apptAt: string, estimatedStart: string | null = null) => ({ isAppt: true, apptAt, estimatedStart });

describe('minutesPastPromise — which time was actually promised', () => {
  it('measures a walk-in against its estimated start', () => {
    expect(minutesPastPromise(walkIn('2026-08-02T14:50:00Z'), NOW)).toBe(10);
  });

  it('measures an appointment against its booked time, not the walk-in estimate', () => {
    expect(minutesPastPromise(appt('2026-08-02T14:45:00Z', '2026-08-02T14:30:00Z'), NOW)).toBe(15);
  });

  it('is 0 rather than negative before the promised time', () => {
    expect(minutesPastPromise(walkIn('2026-08-02T15:30:00Z'), NOW)).toBe(0);
  });

  it('is null with no promised time to measure against', () => {
    expect(minutesPastPromise(walkIn(null), NOW)).toBeNull();
  });

  it('is null for a late arrival — they were deliberately given no estimate', () => {
    expect(minutesPastPromise(walkIn('2026-08-02T13:00:00Z', true), NOW)).toBeNull();
  });
});

describe('isLate — the 2-minute grace', () => {
  it('uses a 2-minute default, matching the API', () => {
    expect(LATE_GRACE_MINUTES).toBe(2);
  });

  it('stays quiet inside the grace period', () => {
    expect(isLate(walkIn('2026-08-02T14:59:00Z'), NOW)).toBe(false);
    expect(isLate(walkIn('2026-08-02T14:58:00Z'), NOW)).toBe(false);
  });

  it('flags just past the grace period', () => {
    expect(isLate(walkIn('2026-08-02T14:57:30Z'), NOW)).toBe(true);
  });

  it('never flags a late arrival, however long they have been there', () => {
    expect(isLate(walkIn('2026-08-02T09:00:00Z', true), NOW)).toBe(false);
  });

  it('clears when the estimate moves back out — the queue got shorter', () => {
    expect(isLate(walkIn('2026-08-02T14:50:00Z'), NOW)).toBe(true);
    expect(isLate(walkIn('2026-08-02T15:10:00Z'), NOW)).toBe(false);
  });
});

describe('latenessLabel', () => {
  it('says "past est." for a walk-in', () => {
    expect(latenessLabel(walkIn('2026-08-02T14:50:00Z'), NOW)).toBe('10m past est.');
  });

  it('says "late" for an appointment', () => {
    expect(latenessLabel(appt('2026-08-02T14:45:00Z'), NOW)).toBe('15m late');
  });

  it('rolls over into hours', () => {
    expect(latenessLabel(walkIn('2026-08-02T13:30:00Z'), NOW)).toBe('1h 30m past est.');
    expect(latenessLabel(walkIn('2026-08-02T13:00:00Z'), NOW)).toBe('2h past est.');
  });

  it('is null inside the grace period, so nothing renders', () => {
    expect(latenessLabel(walkIn('2026-08-02T14:59:00Z'), NOW)).toBeNull();
  });

  it('is null for a late arrival', () => {
    expect(latenessLabel(walkIn('2026-08-02T09:00:00Z', true), NOW)).toBeNull();
  });
});
