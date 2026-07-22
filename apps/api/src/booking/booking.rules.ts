export function intervalsOverlap(startA: Date, durationAMinutes: number, startB: Date, durationBMinutes: number) {
  const endA = startA.getTime() + durationAMinutes * 60_000;
  const endB = startB.getTime() + durationBMinutes * 60_000;
  return startA.getTime() < endB && startB.getTime() < endA;
}

export function isBookingDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
