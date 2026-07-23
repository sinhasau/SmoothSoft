/** True when a remote queue join's estimated finish would land more than `graceMinutes` past closing. */
export function exceedsClosingGrace(estimatedFinish: Date, closeAt: Date, graceMinutes: number): boolean {
  return estimatedFinish.getTime() > closeAt.getTime() + graceMinutes * 60_000;
}
