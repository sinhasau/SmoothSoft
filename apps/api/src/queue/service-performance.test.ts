import { describe, expect, it } from 'vitest';
import { rollingServiceAverages } from './service-performance';

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
