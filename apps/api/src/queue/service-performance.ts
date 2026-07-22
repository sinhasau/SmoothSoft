export interface CompletedServiceTiming {
  staffId: string;
  serviceId: string;
  serviceStartedAt: Date;
  serviceCompletedAt: Date;
}

export interface ServicePerformanceAverage {
  staffId: string;
  serviceId: string;
  averageMinutes: number;
  sampleCount: number;
}

/** Rows must be newest-first. Keeps the latest ten valid completions per employee/service pair. */
export function rollingServiceAverages(rows: CompletedServiceTiming[], sampleLimit = 10): ServicePerformanceAverage[] {
  const samples = new Map<string, number[]>();
  for (const row of rows) {
    const minutes = (row.serviceCompletedAt.getTime() - row.serviceStartedAt.getTime()) / 60_000;
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 12 * 60) continue;
    const key = `${row.staffId}:${row.serviceId}`;
    const values = samples.get(key) ?? [];
    if (values.length >= sampleLimit) continue;
    values.push(minutes);
    samples.set(key, values);
  }
  return [...samples.entries()].map(([key, values]) => {
    const separator = key.indexOf(':');
    return {
      staffId: key.slice(0, separator),
      serviceId: key.slice(separator + 1),
      averageMinutes: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
      sampleCount: values.length,
    };
  });
}
