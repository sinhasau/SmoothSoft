import { describe, expect, it } from 'vitest';
import { buildBarberTimelines, type TimelineJob, type TimelineStaff } from './barber-timeline';

const NOW = new Date('2026-07-22T14:00:00Z');

const staff = (staffId: string, overrides: Partial<TimelineStaff> = {}): TimelineStaff => ({
  staffId,
  fullName: staffId.toUpperCase(),
  status: 'available',
  ...overrides,
});

const job = (queueEntryId: string, durationMinutes: number, overrides: Partial<TimelineJob> = {}): TimelineJob => ({
  queueEntryId,
  label: queueEntryId,
  durationMinutes,
  ...overrides,
});

const blockIds = (result: ReturnType<typeof buildBarberTimelines>, staffId: string) =>
  result.timelines.find((t) => t.staffId === staffId)!.blocks.map((b) => b.queueEntryId);

describe('buildBarberTimelines — staffing follows live clock state', () => {
  it('excludes barbers who are off the floor entirely', () => {
    const result = buildBarberTimelines([staff('a'), staff('b', { status: 'off' })], [job('j1', 20)], NOW);
    expect(result.timelines.map((t) => t.staffId)).toEqual(['a']);
  });

  it('keeps a barber on break in the pool but starts them after the break ends', () => {
    const result = buildBarberTimelines(
      [staff('a', { status: 'break', availableAt: new Date('2026-07-22T14:15:00Z') })],
      [job('j1', 20)],
      NOW,
    );
    const [block] = result.timelines[0].blocks;
    expect(block.start.toISOString()).toBe('2026-07-22T14:15:00.000Z');
    expect(block.end.toISOString()).toBe('2026-07-22T14:35:00.000Z');
  });

  it('leaves work unassigned when everyone has clocked out', () => {
    const result = buildBarberTimelines([staff('a', { status: 'off' })], [job('j1', 20)], NOW);
    expect(result.timelines).toEqual([]);
    expect(result.unassigned).toEqual([{ queueEntryId: 'j1', label: 'j1', reason: 'no_eligible_staff' }]);
  });
});

describe('buildBarberTimelines — in-progress work anchors the clock', () => {
  it('places the current job first and starts the next entry after it', () => {
    const result = buildBarberTimelines(
      [staff('a')],
      [
        job('current', 20, { inServiceWithStaffId: 'a', projectedEnd: new Date('2026-07-22T14:12:00Z') }),
        job('next', 30),
      ],
      NOW,
    );
    expect(blockIds(result, 'a')).toEqual(['current', 'next']);
    const [, next] = result.timelines[0].blocks;
    expect(next.start.toISOString()).toBe('2026-07-22T14:12:00.000Z');
  });

  it('uses the overrun-adjusted projected end, so a late job pushes the rest of the day', () => {
    const onTime = buildBarberTimelines(
      [staff('a')],
      [job('current', 20, { inServiceWithStaffId: 'a', projectedEnd: new Date('2026-07-22T14:10:00Z') }), job('next', 20)],
      NOW,
    );
    const late = buildBarberTimelines(
      [staff('a')],
      [job('current', 20, { inServiceWithStaffId: 'a', projectedEnd: new Date('2026-07-22T14:25:00Z') }), job('next', 20)],
      NOW,
    );
    expect(onTime.timelines[0].blocks[1].start.toISOString()).toBe('2026-07-22T14:10:00.000Z');
    expect(late.timelines[0].blocks[1].start.toISOString()).toBe('2026-07-22T14:25:00.000Z');
  });

  it('ignores in-progress work pinned to a barber who is no longer on the floor', () => {
    const result = buildBarberTimelines(
      [staff('a', { status: 'off' })],
      [job('orphan', 20, { inServiceWithStaffId: 'a' })],
      NOW,
    );
    expect(result.timelines).toEqual([]);
  });
});

describe('buildBarberTimelines — greedy earliest-free assignment', () => {
  it('seats each entry on whichever barber frees up soonest', () => {
    const result = buildBarberTimelines(
      [staff('a'), staff('b')],
      [job('j1', 30), job('j2', 10), job('j3', 10)],
      NOW,
    );
    // j1 -> a (free now), j2 -> b (also free now, a is busy 30m), j3 -> b (free at 14:10 vs a at 14:30)
    expect(blockIds(result, 'a')).toEqual(['j1']);
    expect(blockIds(result, 'b')).toEqual(['j2', 'j3']);
  });

  it('spreads work across an idle barber instead of stacking one chair', () => {
    const result = buildBarberTimelines([staff('a'), staff('b')], [job('j1', 20), job('j2', 20)], NOW);
    expect(blockIds(result, 'a')).toEqual(['j1']);
    expect(blockIds(result, 'b')).toEqual(['j2']);
  });

  it('respects a hard requested barber even when someone else is free sooner', () => {
    const result = buildBarberTimelines(
      [staff('a'), staff('b')],
      [job('j1', 40, { requestedStaffId: 'a' }), job('j2', 20, { requestedStaffId: 'a' })],
      NOW,
    );
    expect(blockIds(result, 'a')).toEqual(['j1', 'j2']);
    expect(blockIds(result, 'b')).toEqual([]);
    expect(result.timelines.find((t) => t.staffId === 'a')!.blocks[1].start.toISOString()).toBe('2026-07-22T14:40:00.000Z');
  });

  it('leaves an entry unassigned when its requested barber is not on the floor', () => {
    const result = buildBarberTimelines([staff('a')], [job('j1', 20, { requestedStaffId: 'gone' })], NOW);
    expect(result.unassigned).toEqual([{ queueEntryId: 'j1', label: 'j1', reason: 'no_eligible_staff' }]);
  });

  it('preserves the priority order it is given (SLA order from appointment-sla)', () => {
    const result = buildBarberTimelines([staff('a')], [job('second', 10), job('first', 10)], NOW);
    expect(blockIds(result, 'a')).toEqual(['second', 'first']);
  });
});

describe('buildBarberTimelines — appointments and shift ends', () => {
  it('never starts an appointment before its scheduled time, even when the chair is free', () => {
    const result = buildBarberTimelines(
      [staff('a')],
      [job('appt', 20, { apptAt: new Date('2026-07-22T15:00:00Z') })],
      NOW,
    );
    const [block] = result.timelines[0].blocks;
    expect(block.start.toISOString()).toBe('2026-07-22T15:00:00.000Z');
    expect(block.kind).toBe('appointment');
  });

  it('starts a late appointment immediately rather than in the past', () => {
    const result = buildBarberTimelines(
      [staff('a')],
      [job('appt', 20, { apptAt: new Date('2026-07-22T13:30:00Z') })],
      NOW,
    );
    expect(result.timelines[0].blocks[0].start.toISOString()).toBe(NOW.toISOString());
  });

  it('will not project work past the end of a barber\'s shift', () => {
    const result = buildBarberTimelines(
      [staff('a', { shiftEndsAt: new Date('2026-07-22T14:15:00Z') })],
      [job('j1', 30)],
      NOW,
    );
    expect(result.timelines[0].blocks).toEqual([]);
    expect(result.unassigned).toEqual([{ queueEntryId: 'j1', label: 'j1', reason: 'past_shift_end' }]);
  });

  it('still seats work that fits inside the remaining shift', () => {
    const result = buildBarberTimelines(
      [staff('a', { shiftEndsAt: new Date('2026-07-22T14:30:00Z') })],
      [job('j1', 20)],
      NOW,
    );
    expect(blockIds(result, 'a')).toEqual(['j1']);
  });
});

describe('buildBarberTimelines — cleanup buffer and freeAt', () => {
  it('reserves the cleanup buffer between consecutive blocks', () => {
    const result = buildBarberTimelines([staff('a')], [job('j1', 20), job('j2', 20)], NOW, 5);
    const [first, second] = result.timelines[0].blocks;
    expect(first.end.toISOString()).toBe('2026-07-22T14:20:00.000Z');
    expect(second.start.toISOString()).toBe('2026-07-22T14:25:00.000Z');
  });

  it('reports freeAt as now for an idle barber and as the last block end otherwise', () => {
    const result = buildBarberTimelines([staff('a'), staff('idle')], [job('j1', 25)], NOW);
    expect(result.timelines.find((t) => t.staffId === 'a')!.freeAt.toISOString()).toBe('2026-07-22T14:25:00.000Z');
    expect(result.timelines.find((t) => t.staffId === 'idle')!.freeAt.toISOString()).toBe(NOW.toISOString());
  });

  it('returns an empty projection for an empty queue without inventing blocks', () => {
    const result = buildBarberTimelines([staff('a')], [], NOW);
    expect(result.timelines).toEqual([{ staffId: 'a', fullName: 'A', blocks: [], freeAt: NOW }]);
    expect(result.unassigned).toEqual([]);
  });
});
