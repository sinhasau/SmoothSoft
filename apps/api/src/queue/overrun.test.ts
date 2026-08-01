import { describe, expect, it } from 'vitest';
import { projectInProgressJob, shopOverrunMinutes, type InProgressJob } from './overrun';

const job = (overrides: Partial<InProgressJob> = {}): InProgressJob => ({
  queueEntryId: 'e1',
  staffId: 's1',
  startedAt: new Date('2026-07-22T14:00:00Z'),
  predictedDurationMinutes: 20,
  ...overrides,
});

describe('projectInProgressJob — on time', () => {
  it('keeps the original prediction while the job is still running on time', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:10:00Z'));
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
    expect(projection.overrunMinutes).toBe(0);
  });

  it('adds no cushion to a healthy job — padding every chair would inflate the board', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:19:00Z'));
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
  });

  it('reports no overrun exactly at the predicted end', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:20:00Z'));
    expect(projection.overrunMinutes).toBe(0);
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:20:00.000Z');
  });
});

describe('projectInProgressJob — running behind adds overrun + catch-up cushion', () => {
  it('adds the real overrun plus 3 minutes: 8 min behind projects 11 min past the prediction', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:28:00Z'));
    // predicted end 14:20, 8 min over -> 14:20 + 8 + 3 = 14:31, i.e. now + 3.
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:31:00.000Z');
    expect(projection.overrunMinutes).toBeCloseTo(8);
  });

  it('applies the cushion to even a slight overrun', () => {
    const projection = projectInProgressJob(job(), new Date('2026-07-22T14:21:00Z'));
    expect(projection.projectedEnd.toISOString()).toBe('2026-07-22T14:24:00.000Z');
    expect(projection.overrunMinutes).toBeCloseTo(1);
  });

  it('always lands exactly `catch-up buffer` past now, whatever the overrun', () => {
    for (const [nowIso, expected] of [
      ['2026-07-22T14:22:00Z', '2026-07-22T14:25:00.000Z'],
      ['2026-07-22T14:35:00Z', '2026-07-22T14:38:00.000Z'],
      ['2026-07-22T15:00:00Z', '2026-07-22T15:03:00.000Z'],
    ]) {
      expect(projectInProgressJob(job(), new Date(nowIso)).projectedEnd.toISOString()).toBe(expected);
    }
  });

  it('never quotes an end in the past, however far behind the job runs', () => {
    const now = new Date('2026-07-22T16:00:00Z');
    expect(projectInProgressJob(job(), now).projectedEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  it('measures overrun continuously rather than in fixed increments', () => {
    const first = projectInProgressJob(job(), new Date('2026-07-22T14:25:00Z'));
    const later = projectInProgressJob(job(), new Date('2026-07-22T14:33:00Z'));
    expect(first.overrunMinutes).toBeCloseTo(5);
    expect(later.overrunMinutes).toBeCloseTo(13);
    expect(later.projectedEnd.getTime()).toBeGreaterThan(first.projectedEnd.getTime());
  });

  it('honors a custom catch-up buffer', () => {
    const now = new Date('2026-07-22T14:28:00Z');
    expect(projectInProgressJob(job(), now, 0).projectedEnd.toISOString()).toBe(now.toISOString());
    expect(projectInProgressJob(job(), now, 5).projectedEnd.toISOString()).toBe('2026-07-22T14:33:00.000Z');
  });

  it('derives lateness from the start stamp alone — no barber ever reports it', () => {
    // A longer predicted duration for the same start time means less overrun,
    // purely from data the Start action already records.
    const now = new Date('2026-07-22T14:28:00Z');
    expect(projectInProgressJob(job({ predictedDurationMinutes: 20 }), now).overrunMinutes).toBeCloseTo(8);
    expect(projectInProgressJob(job({ predictedDurationMinutes: 45 }), now).overrunMinutes).toBe(0);
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
