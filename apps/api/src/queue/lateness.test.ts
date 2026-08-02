import { describe, expect, it } from 'vitest';
import { isPastPromise, LATE_GRACE_MINUTES, minutesPastPromise } from './lateness';
import { estimateWaitTimes } from './wait-time';

const NOW = new Date('2026-08-02T15:00:00Z');
const at = (iso: string) => new Date(iso);

const walkIn = (estimatedStart: string | null) => ({ isAppt: false, apptAt: null, estimatedStart: estimatedStart ? at(estimatedStart) : null });
const appointment = (apptAt: string, estimatedStart: string | null = null) => ({ isAppt: true, apptAt: at(apptAt), estimatedStart: estimatedStart ? at(estimatedStart) : null });

describe('minutesPastPromise — which time counts as the promise', () => {
  it('measures a walk-in against its estimated start', () => {
    expect(minutesPastPromise(walkIn('2026-08-02T14:50:00Z'), NOW)).toBe(10);
  });

  it('measures an appointment against its booked time, not the walk-in estimate', () => {
    // Booked 14:45 but the board estimated 14:30 — the promise was 14:45.
    expect(minutesPastPromise(appointment('2026-08-02T14:45:00Z', '2026-08-02T14:30:00Z'), NOW)).toBe(15);
  });

  it('is 0, not negative, for someone whose time has not come yet', () => {
    expect(minutesPastPromise(walkIn('2026-08-02T15:30:00Z'), NOW)).toBe(0);
  });

  it('is null when there is no promised time to be late against', () => {
    expect(minutesPastPromise(walkIn(null), NOW)).toBeNull();
    expect(minutesPastPromise({ isAppt: true, apptAt: null, estimatedStart: at('2026-08-02T14:00:00Z') }, NOW)).toBeNull();
  });

  it('is exactly 0 at the promised moment', () => {
    expect(minutesPastPromise(walkIn('2026-08-02T15:00:00Z'), NOW)).toBe(0);
  });
});

describe('isPastPromise — the 2-minute grace', () => {
  it('stays quiet inside the grace period', () => {
    expect(isPastPromise(walkIn('2026-08-02T14:59:00Z'), NOW)).toBe(false);
    expect(isPastPromise(walkIn('2026-08-02T14:58:00Z'), NOW)).toBe(false);
  });

  it('flags once past the grace period', () => {
    expect(isPastPromise(walkIn('2026-08-02T14:57:30Z'), NOW)).toBe(true);
    expect(isPastPromise(walkIn('2026-08-02T14:45:00Z'), NOW)).toBe(true);
  });

  it('uses a 2-minute default', () => {
    expect(LATE_GRACE_MINUTES).toBe(2);
  });

  it('honors a custom grace period', () => {
    const fiveMinutesLate = walkIn('2026-08-02T14:55:00Z');
    expect(isPastPromise(fiveMinutesLate, NOW, 10)).toBe(false);
    expect(isPastPromise(fiveMinutesLate, NOW, 1)).toBe(true);
  });

  it('never flags an entry with no promised time', () => {
    expect(isPastPromise(walkIn(null), NOW)).toBe(false);
  });

  it('clears itself if the estimate moves back out — the queue got shorter', () => {
    const entry = walkIn('2026-08-02T14:50:00Z');
    expect(isPastPromise(entry, NOW)).toBe(true);
    expect(isPastPromise(walkIn('2026-08-02T15:10:00Z'), NOW)).toBe(false);
  });
});

describe('what the late-arrival flag actually buys the queue', () => {
  // The flag's whole purpose: someone who turned up well past their estimate
  // stops pushing everyone behind them back. getBoard implements this by
  // filtering them out of the list fed to the SLA reorder and the estimator;
  // this pins the property that filtering is supposed to deliver.
  const queue = [
    { queueEntryId: 'ahead', serviceDurationMinutes: 20 },
    { queueEntryId: 'lateArrival', serviceDurationMinutes: 45 },
    { queueEntryId: 'behind', serviceDurationMinutes: 20 },
  ];
  const NOW_ = new Date('2026-08-02T15:00:00Z');

  it('would delay everyone behind them if they stayed in the estimate', () => {
    const withThem = estimateWaitTimes(queue, NOW_);
    expect(withThem.find((e) => e.queueEntryId === 'behind')!.estimatedStart.toISOString())
      .toBe('2026-08-02T16:05:00.000Z');
  });

  it('leaves the person behind them 45 minutes earlier once flagged', () => {
    const withoutThem = estimateWaitTimes(queue.filter((e) => e.queueEntryId !== 'lateArrival'), NOW_);
    expect(withoutThem.find((e) => e.queueEntryId === 'behind')!.estimatedStart.toISOString())
      .toBe('2026-08-02T15:20:00.000Z');
  });

  it('does not disturb anyone ahead of them either way', () => {
    const ahead = (list: typeof queue) => estimateWaitTimes(list, NOW_).find((e) => e.queueEntryId === 'ahead')!.estimatedStart.toISOString();
    expect(ahead(queue)).toBe(ahead(queue.filter((e) => e.queueEntryId !== 'lateArrival')));
  });

  it('gives the late arrival no estimate of its own — nobody can promise one', () => {
    const estimates = estimateWaitTimes(queue.filter((e) => e.queueEntryId !== 'lateArrival'), NOW_);
    expect(estimates.find((e) => e.queueEntryId === 'lateArrival')).toBeUndefined();
  });
});
