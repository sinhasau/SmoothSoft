const DAY_MS = 86_400_000;
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function atUtc(date: string) { return new Date(`${date}T00:00:00.000Z`); }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * DAY_MS); }
function monthEnd(year: number, month: number) { return new Date(Date.UTC(year, month + 1, 0)); }

export function addBusinessDays(date: Date, count: number) {
  let result = new Date(date);
  let remaining = count;
  while (remaining > 0) {
    result = addDays(result, 1);
    if (result.getUTCDay() !== 0 && result.getUTCDay() !== 6) remaining -= 1;
  }
  return result;
}

function periodContaining(frequency: PayFrequency, anchorDate: string, today: Date) {
  const todayUtc = atUtc(isoDate(today));
  if (frequency === 'semimonthly') {
    const year = todayUtc.getUTCFullYear();
    const month = todayUtc.getUTCMonth();
    return todayUtc.getUTCDate() <= 15
      ? { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month, 15)) }
      : { start: new Date(Date.UTC(year, month, 16)), end: monthEnd(year, month) };
  }
  if (frequency === 'monthly') {
    const year = todayUtc.getUTCFullYear();
    const month = todayUtc.getUTCMonth();
    return { start: new Date(Date.UTC(year, month, 1)), end: monthEnd(year, month) };
  }
  const lengthDays = frequency === 'weekly' ? 7 : 14;
  const anchor = atUtc(anchorDate);
  const elapsedDays = Math.floor((todayUtc.getTime() - anchor.getTime()) / DAY_MS);
  const cycle = Math.floor(elapsedDays / lengthDays);
  const start = addDays(anchor, cycle * lengthDays);
  return { start, end: addDays(start, lengthDays - 1) };
}

function nextPeriod(frequency: PayFrequency, start: Date, end: Date) {
  if (frequency === 'weekly') return { start: addDays(start, 7), end: addDays(end, 7) };
  if (frequency === 'biweekly') return { start: addDays(start, 14), end: addDays(end, 14) };
  const nextStart = addDays(end, 1);
  if (frequency === 'monthly') return { start: nextStart, end: monthEnd(nextStart.getUTCFullYear(), nextStart.getUTCMonth()) };
  return nextStart.getUTCDate() === 1
    ? { start: nextStart, end: new Date(Date.UTC(nextStart.getUTCFullYear(), nextStart.getUTCMonth(), 15)) }
    : { start: nextStart, end: monthEnd(nextStart.getUTCFullYear(), nextStart.getUTCMonth()) };
}

export function paySchedule(frequency: PayFrequency, anchorDate: string, paydayOffsetBusinessDays: number, today = new Date()) {
  let { start, end } = periodContaining(frequency, anchorDate, today);
  const periods = [];
  for (let index = 0; index < 4; index += 1) {
    periods.push({ periodStart: isoDate(start), periodEnd: isoDate(end), payDate: isoDate(addBusinessDays(end, paydayOffsetBusinessDays)) });
    ({ start, end } = nextPeriod(frequency, start, end));
  }
  return { currentPeriodStart: periods[0].periodStart, currentPeriodEnd: periods[0].periodEnd, nextPayDate: periods[0].payDate, upcomingPeriods: periods };
}

/** Backward-compatible helper used by older callers and tests. */
export function payrollPeriod(anchorDate: string, lengthDays: 7 | 14, paydayOffsetDays: number, today = new Date()) {
  const result = paySchedule(lengthDays === 7 ? 'weekly' : 'biweekly', anchorDate, paydayOffsetDays, today);
  return { currentPeriodStart: result.currentPeriodStart, currentPeriodEnd: result.currentPeriodEnd, nextPayDate: result.nextPayDate };
}
