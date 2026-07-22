function partsInTimezone(timezone: string, now: Date, includeTime = false) {
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
  if (includeTime) Object.assign(options, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

export function dateInTimezone(timezone: string, now = new Date()) {
  const { year, month, day } = partsInTimezone(timezone, now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function startOfDayInTimezone(timezone: string, now = new Date()) {
  const { year, month, day } = partsInTimezone(timezone, now);
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const atGuess = partsInTimezone(timezone, utcGuess, true);
  const timezoneOffsetMs = Date.UTC(atGuess.year, atGuess.month - 1, atGuess.day, atGuess.hour, atGuess.minute, atGuess.second) - utcGuess.getTime();
  return new Date(utcGuess.getTime() - timezoneOffsetMs);
}

export function dayOfWeekInTimezone(timezone: string, now = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}
