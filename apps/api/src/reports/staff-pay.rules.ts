export interface CompEffectiveRow {
  effectiveFrom: Date;
  /** null = still in effect. */
  effectiveTo: Date | null;
}

/**
 * True when more than one compensation rate was in effect during the pay period — i.e. the staff
 * member's pay rate changed mid-period. The pay run applies a single rate to the whole period, so
 * when this is true the estimate can silently over/under-pay and must be reviewed (or prorated)
 * before payroll. A row is "in effect during the period" when it starts before the period ends and
 * has not ended before the period begins.
 */
export function compensationChangedDuringPeriod(rows: CompEffectiveRow[], start: Date, endExclusive: Date): boolean {
  const overlapping = rows.filter(
    (row) => row.effectiveFrom < endExclusive && (row.effectiveTo === null || row.effectiveTo >= start),
  );
  return overlapping.length > 1;
}
