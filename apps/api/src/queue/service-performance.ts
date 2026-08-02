export interface CompletedServiceTiming {
  staffId: string;
  serviceId: string;
  serviceStartedAt: Date;
  serviceCompletedAt: Date;
  /** The service's catalog duration, used to bound implausible readings. */
  catalogMinutes?: number | null;
}

export interface ServicePerformanceAverage {
  staffId: string;
  serviceId: string;
  /** Median of the sample window — see why below. */
  averageMinutes: number;
  sampleCount: number;
}

/** How many times over its catalog duration a reading may run before it is discarded. */
export const OUTLIER_MULTIPLE = 5;

/** Absolute backstop for services with no catalog duration to scale against. */
const ABSOLUTE_CAP_MINUTES = 12 * 60;

/**
 * Median, not mean. Over a 10-sample window a single extreme reading moves the
 * mean by (outlier − typical) / 10 and stays for the next ten jobs: one
 * four-hour "forgot to hit Complete" turns a 20-minute average into 42. The
 * median is unmoved by one or two extremes, so it needs no tuning to stay
 * honest, and it makes a low-end guard unnecessary — an accidental
 * complete-immediately click is just another value the middle ignores.
 */
export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * A reading is plausible when it is positive and within OUTLIER_MULTIPLE of the
 * service's own catalog duration — a bound that scales per service, unlike a
 * flat ceiling: 5x lets a 20-minute haircut run to 100 minutes for a genuinely
 * hard head of hair, while a 10-minute line-up is cut off at 50. Anything past
 * that is not a slow service, it is a job someone left open.
 */
export function isPlausibleDuration(minutes: number, catalogMinutes?: number | null): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  const cap = catalogMinutes && catalogMinutes > 0 ? catalogMinutes * OUTLIER_MULTIPLE : ABSOLUTE_CAP_MINUTES;
  return minutes <= cap;
}

/** Rows must be newest-first. Keeps the latest ten plausible completions per employee/service pair. */
export function rollingServiceAverages(rows: CompletedServiceTiming[], sampleLimit = 10): ServicePerformanceAverage[] {
  const samples = new Map<string, number[]>();
  for (const row of rows) {
    const minutes = (row.serviceCompletedAt.getTime() - row.serviceStartedAt.getTime()) / 60_000;
    if (!isPlausibleDuration(minutes, row.catalogMinutes)) continue;
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
      averageMinutes: Math.round(medianOf(values) * 10) / 10,
      sampleCount: values.length,
    };
  });
}

/**
 * The stand-in for "the barber's average" when no specific barber is known —
 * the shop's primary path, where a walk-in takes whoever frees up first.
 *
 * Median of the on-floor barbers' own medians, not a median over their pooled
 * completions: "next available" means roughly any of them could take the
 * chair, so each barber should count once rather than in proportion to how
 * busy they happen to have been. It also moves with the shift — a floor of
 * your three quickest barbers really is faster than a floor of your three
 * slowest, which a static catalog number cannot express.
 */
export function poolMediansByService(
  barberMedians: ServicePerformanceAverage[],
  onFloorStaffIds: Set<string>,
): Map<string, number> {
  const byService = new Map<string, number[]>();
  for (const item of barberMedians) {
    if (!onFloorStaffIds.has(item.staffId)) continue;
    byService.set(item.serviceId, [...(byService.get(item.serviceId) ?? []), item.averageMinutes]);
  }
  const pooled = new Map<string, number>();
  for (const [serviceId, medians] of byService) {
    pooled.set(serviceId, Math.round(medianOf(medians) * 10) / 10);
  }
  return pooled;
}
