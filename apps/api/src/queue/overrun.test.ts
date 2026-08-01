import { describe, expect, it } from 'vitest';
import { projectInProgressJob, shopOverrunMinutes, type InProgressJob } from './overrun';

const job = (overrides: Partial<InProgressJob> = {}): InProgressJob => ({
  queueEntryId: 'e1',
  staffId: 's1',
  startedAt: new Date('2026-07-22T14:00:00Z'),
  predictedDurationMinutes: 20,
  ...overrides,
});

describe('projectInProgressJob', () => {
  it('keeps the original prediction while the job is still on time', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:10:00Z'));
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
    expect(projection.overrunMinutes).toBe(0);
  });

  it('reports no overrun exactly at the predicted end', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:20:00Z'));
    expect(projection.overrunMinutes).toBe(0);
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
  });

  it('holds the prediction inside the deadband rather than twitching the board', () => {
    // 1 minute over, default 2-minute deadband.
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:21:00Z'));
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
    expect(projection.overrunMinutes).toBeCloseTo(1);
  });

  it('pushes the projected end to exactly now once genuinely behind', () => {
    // 8 minutes over — the buffer added is the real lateness, not a fixed step.
    const now = new Date('2026-07-22T14:28:00Z');
    const projection = projectInProgressJob(job(), now);
    expect(projection.projectedEnd.toISOString()).toBe(now.toISOString());
    expect(projection.overrunMinutes).toBeCloseTo(8);
  });

  it('grows continuously as the overrun continues, not in fixed increments', () => {
    const first = projectInProgressJob(job(), new Date('2026-07-22T14:25:00Z'));
    const later = projectInProgressJob(job(), new Date('2026-07-22T14:33:00Z'));
    expect(first.overrunMinutes).toBeCloseTo(5);
    expect(later.overrunMinutes).toBeCloseTo(13);
    expect(later.projectedEnd.getTime()).toBeGreaterThan(first.projectedEnd.getTime());
  });

  it('honors a custom deadband', () => {
    const now = new Date('2026-07-22T14:23:00Z');
    expect(projectInProgressJob(job(), now, 10).projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
    expect(projectInProgressJob(job(), now, 1).projectedEnd.toISOString()).toBe(now.toISOString());
  });
});

describe('shopOverrunMinutes', () => {
  const projection = (overrunMinutes: number) => ({ queueEntryId: 'e', staffId: 's', projectedEnd: new Date(), overrunMinutes });

  it('is zero when nothing is running behind', () => {
    expect(shopOverrunMinutes([projection(0), projection(0)])).toBe(0);
  });

  it('is zero for an empty floor', () => {
    expect(shopOverrunMinutes([])).toBe(0);
  });

  it('takes the worst single overrun, not the sum — parallel chairs do not add up', () => {
    expect(shopOverrunMinutes([projection(5), projection(5), projection(5)])).toBe(5);
  });

  it('surfaces one badly stuck chair instead of averaging it away', () => {
    expect(shopOverrunMinutes([projection(0), projection(0), projection(22)])).toBe(22);
  });
});
