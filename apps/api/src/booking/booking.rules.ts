export function intervalsOverlap(startA: Date, durationAMinutes: number, startB: Date, durationBMinutes: number) {
  const endA = startA.getTime() + durationAMinutes * 60_000;
  const endB = startB.getTime() + durationBMinutes * 60_000;
  return startA.getTime() < endB && startB.getTime() < endA;
}

export function isBookingDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * True when a database error is the appointment overlap-guard constraint firing (Postgres
 * exclusion_violation, code 23P01, from migration 0046). Lets the write paths translate the
 * last-resort DB backstop into the same friendly conflict the app-level checks already raise.
 */
export function isAppointmentOverlapError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const record = err as { code?: string; constraint?: string };
  return record.code === '23P01' && record.constraint === 'appointments_no_staff_overlap';
}
