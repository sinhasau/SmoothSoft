import { describe, expect, it } from 'vitest';
import { estimateWaitTimes } from './wait-time';

describe('estimateWaitTimes', () => {
  it('starts the first entry at now', () => {
    const now = new Date('2026-07-22T10:00:00Z');
    const [first] = estimateWaitTimes([{ queueEntryId: 'a', serviceDurationMinutes: 30 }], now);
    expect(first.estimatedStart.toISOString()).toBe(now.toISOString());
  });

  it('runs a single shared clock forward by each preceding entry\'s duration, in order', () => {
    const now = new Date('2026-07-22T10:00:00Z');
    const estimates = estimateWaitTimes(
      [
        { queueEntryId: 'a', serviceDurationMinutes: 30 },
        { queueEntryId: 'b', serviceDurationMinutes: 45 },
        { queueEntryId: 'c', serviceDurationMinutes: 15 },
      ],
      now,
    );
    expect(estimates.map((e) => e.estimatedStart.toISOString())).toEqual([
      '2026-07-22T10:00:00.000Z',
      '2026-07-22T10:30:00.000Z',
      '2026-07-22T11:15:00.000Z',
    ]);
  });

  it('returns an empty array for an empty queue', () => {
    expect(estimateWaitTimes([], new Date())).toEqual([]);
  });

  it('preserves queueEntryId order and identity in the output', () => {
    const estimates = estimateWaitTimes([
      { queueEntryId: 'x', serviceDurationMinutes: 0 },
      { queueEntryId: 'y', serviceDurationMinutes: 0 },
    ]);
    expect(estimates.map((e) => e.queueEntryId)).toEqual(['x', 'y']);
  });

  it('does not mutate the `now` argument', () => {
    const now = new Date('2026-07-22T10:00:00Z');
    const copy = new Date(now);
    estimateWaitTimes([{ queueEntryId: 'a', serviceDurationMinutes: 60 }], now);
    expect(now.toISOString()).toBe(copy.toISOString());
  });
});
