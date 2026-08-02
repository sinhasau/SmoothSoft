import { describe, expect, it } from 'vitest';
import { poolMediansByService, rollingServiceAverages } from './service-performance';

describe('rollingServiceAverages', () => {
  it('averages only the latest ten valid employee/service completions', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      staffId: 'staff-1', serviceId: 'service-1',
      serviceStartedAt: new Date(`2026-07-21T10:${String(index).padStart(2, '0')}:00Z`),
      serviceCompletedAt: new Date(new Date(`2026-07-21T10:${String(index).padStart(2, '0')}:00Z`).getTime() + (index + 10) * 60_000),
    }));
    expect(rollingServiceAverages(rows)).toEqual([{ staffId: 'staff-1', serviceId: 'service-1', averageMinutes: 14.5, sampleCount: 10 }]);
  });

  it('keeps employee and service histories separate and ignores invalid durations', () => {
    const start = new Date('2026-07-21T10:00:00Z');
    const rows = [
      { staffId: 'a', serviceId: 'cut', serviceStartedAt: start, serviceCompletedAt: new Date(start.getTime() + 20 * 60_000) },
      { staffId: 'b', serviceId: 'cut', serviceStartedAt: start, serviceCompletedAt: new Date(start.getTime() + 30 * 60_000) },
      { staffId: 'a', serviceId: 'color', serviceStartedAt: start, serviceCompletedAt: start },
    ];
    expect(rollingServiceAverages(rows)).toEqual([
      { staffId: 'a', serviceId: 'cut', averageMinutes: 20, sampleCount: 1 },
      { staffId: 'b', serviceId: 'cut', averageMinutes: 30, sampleCount: 1 },
    ]);
  });
});

const at = (startIso: string, minutes: number, catalogMinutes: number | null = 20) => ({
  staffId: 's1',
  serviceId: 'cut',
  serviceStartedAt: new Date(startIso),
  serviceCompletedAt: new Date(new Date(startIso).getTime() + minutes * 60_000),
  catalogMinutes,
});

describe('median resists a single bad reading', () => {
  it('is unmoved by one long visit that a mean would be dragged by', () => {
    // Nine 20-minute cuts and one 90-minute one. Mean would be 27; median stays 20.
    const rows = [at('2026-07-21T10:00:00Z', 90), ...Array.from({ length: 9 }, () => at('2026-07-21T11:00:00Z', 20))];
    expect(rollingServiceAverages(rows)[0].averageMinutes).toBe(20);
  });

  it('is unmoved by an accidental complete-immediately click, so no low-end guard is needed', () => {
    const rows = [at('2026-07-21T10:00:00Z', 0.1), ...Array.from({ length: 5 }, () => at('2026-07-21T11:00:00Z', 20))];
    expect(rollingServiceAverages(rows)[0].averageMinutes).toBe(20);
  });

  it('averages the two middle values for an even-sized window', () => {
    const rows = [at('2026-07-21T10:00:00Z', 18), at('2026-07-21T11:00:00Z', 22)];
    expect(rollingServiceAverages(rows)[0].averageMinutes).toBe(20);
  });

  it('still tracks a genuine, sustained shift in pace', () => {
    // A barber who has genuinely slowed to 30 minutes reports 30, not 20.
    const rows = Array.from({ length: 6 }, () => at('2026-07-21T10:00:00Z', 30));
    expect(rollingServiceAverages(rows)[0].averageMinutes).toBe(30);
  });
});

describe('outlier bound scales with the service, at 5x its catalog duration', () => {
  it('keeps a hard job that runs under the bound', () => {
    // 95 minutes on a 20-minute service is 4.75x — slow, but real.
    const rows = [at('2026-07-21T10:00:00Z', 95), at('2026-07-21T11:00:00Z', 95), at('2026-07-21T12:00:00Z', 95)];
    expect(rollingServiceAverages(rows)[0].sampleCount).toBe(3);
  });

  it('discards a reading past 5x — a job left open, not a slow service', () => {
    const rows = [at('2026-07-21T10:00:00Z', 240), at('2026-07-21T11:00:00Z', 20), at('2026-07-21T12:00:00Z', 20)];
    const [result] = rollingServiceAverages(rows);
    expect(result.sampleCount).toBe(2);
    expect(result.averageMinutes).toBe(20);
  });

  it('scales the bound per service — a short service gets a tighter ceiling', () => {
    // 40 minutes is fine for a 20-minute cut (2x) but not for a 5-minute line-up (8x).
    expect(rollingServiceAverages([at('2026-07-21T10:00:00Z', 40, 20)])[0].sampleCount).toBe(1);
    expect(rollingServiceAverages([at('2026-07-21T10:00:00Z', 40, 5)])).toEqual([]);
  });

  it('falls back to the absolute cap when the service has no catalog duration', () => {
    expect(rollingServiceAverages([at('2026-07-21T10:00:00Z', 600, null)])[0].sampleCount).toBe(1);
    expect(rollingServiceAverages([at('2026-07-21T10:00:00Z', 800, null)])).toEqual([]);
  });

  it('drops a discarded reading entirely rather than letting it use a sample slot', () => {
    const rows = [at('2026-07-21T10:00:00Z', 500), ...Array.from({ length: 10 }, () => at('2026-07-21T11:00:00Z', 20))];
    expect(rollingServiceAverages(rows)[0].sampleCount).toBe(10);
  });
});

describe('poolMediansByService — the stand-in when no barber is known yet', () => {
  const median = (staffId: string, serviceId: string, averageMinutes: number) => ({ staffId, serviceId, averageMinutes, sampleCount: 5 });

  it('takes the median across the on-floor barbers for that service', () => {
    const pooled = poolMediansByService(
      [median('a', 'cut', 18), median('b', 'cut', 22), median('c', 'cut', 26)],
      new Set(['a', 'b', 'c']),
    );
    expect(pooled.get('cut')).toBe(22);
  });

  it('counts each barber once, not in proportion to how busy they were', () => {
    // Barber medians are already per-barber, so a busy barber cannot outvote a quiet one.
    const pooled = poolMediansByService([median('a', 'cut', 20), median('b', 'cut', 40)], new Set(['a', 'b']));
    expect(pooled.get('cut')).toBe(30);
  });

  it('moves with the shift — a faster floor gives a faster pool', () => {
    const all = [median('fast1', 'cut', 16), median('fast2', 'cut', 18), median('slow1', 'cut', 30), median('slow2', 'cut', 32)];
    expect(poolMediansByService(all, new Set(['fast1', 'fast2']))!.get('cut')).toBe(17);
    expect(poolMediansByService(all, new Set(['slow1', 'slow2']))!.get('cut')).toBe(31);
  });

  it('excludes barbers who are off the floor', () => {
    const pooled = poolMediansByService([median('on', 'cut', 20), median('off', 'cut', 60)], new Set(['on']));
    expect(pooled.get('cut')).toBe(20);
  });

  it('keeps services separate', () => {
    const pooled = poolMediansByService([median('a', 'cut', 20), median('a', 'colour', 50)], new Set(['a']));
    expect(pooled.get('cut')).toBe(20);
    expect(pooled.get('colour')).toBe(50);
  });

  it('reports nothing for a service no on-floor barber has history for', () => {
    expect(poolMediansByService([median('a', 'cut', 20)], new Set(['a'])).get('colour')).toBeUndefined();
  });

  it('is empty when nobody is on the floor, so callers fall through to the catalog', () => {
    expect(poolMediansByService([median('a', 'cut', 20)], new Set()).size).toBe(0);
  });
});
