import { describe, expect, it } from 'vitest';
import { localDayOfWeek, resolveTodayHours } from './store-hours';
import { exceedsClosingGrace } from './closing-guard';

const DETROIT = 'America/Detroit';
// 2026-08-01 is a Saturday. 21:00Z is 5:00 PM EDT (UTC-4) that afternoon.
const SATURDAY_5PM_EDT = new Date('2026-08-01T21:00:00Z');
// 00:30Z on the 2nd is still 8:30 PM EDT on Saturday the 1st.
const SATURDAY_830PM_EDT = new Date('2026-08-02T00:30:00Z');

const openTill = (close: string, open = '09:00') => ({ is_open: true, open_time: open, close_time: close });

describe('localDayOfWeek', () => {
  it('stays on the shop\'s local day after UTC has rolled over', () => {
    // The regression: server-side `now.getDay()` on a UTC box returns Sunday
    // here, so a Saturday-evening join read Sunday's store_hours row.
    expect(localDayOfWeek(DETROIT, SATURDAY_830PM_EDT)).toBe(6);
  });

  it('reports the ordinary case correctly too', () => {
    expect(localDayOfWeek(DETROIT, SATURDAY_5PM_EDT)).toBe(6);
  });
});

describe('resolveTodayHours — closing time is the shop\'s clock, not the server\'s', () => {
  it('resolves a 9pm local close to 1am UTC, not 9pm UTC', () => {
    const hours = resolveTodayHours(DETROIT, null, openTill('21:00'), SATURDAY_5PM_EDT);
    expect(hours.closed).toBe(false);
    expect(hours.closeAt!.toISOString()).toBe('2026-08-02T01:00:00.000Z');
  });

  it('resolves the opening time in local terms as well', () => {
    const hours = resolveTodayHours(DETROIT, null, openTill('21:00', '09:00'), SATURDAY_5PM_EDT);
    expect(hours.openAt!.toISOString()).toBe('2026-08-01T13:00:00.000Z');
  });

  it('reports the shop\'s local calendar date, not the UTC one', () => {
    expect(resolveTodayHours(DETROIT, null, openTill('21:00'), SATURDAY_830PM_EDT).localDate).toBe('2026-08-01');
  });

  it('handles a winter (EST, UTC-5) date without drifting', () => {
    const januaryAfternoon = new Date('2026-01-17T20:00:00Z'); // 3pm EST
    const hours = resolveTodayHours(DETROIT, null, openTill('21:00'), januaryAfternoon);
    expect(hours.closeAt!.toISOString()).toBe('2026-01-18T02:00:00.000Z');
  });
});

describe('resolveTodayHours — open/closed decisions', () => {
  it('is closed when the weekly row says the shop does not open that day', () => {
    expect(resolveTodayHours(DETROIT, null, { is_open: false }, SATURDAY_5PM_EDT).closed).toBe(true);
  });

  it('is closed when there is no weekly row at all', () => {
    expect(resolveTodayHours(DETROIT, null, undefined, SATURDAY_5PM_EDT).closed).toBe(true);
  });

  it('is closed when a weekly row is open but carries no closing time', () => {
    expect(resolveTodayHours(DETROIT, null, { is_open: true, close_time: null }, SATURDAY_5PM_EDT).closed).toBe(true);
  });

  it('lets a special-hours row close a normally-open day', () => {
    const hours = resolveTodayHours(DETROIT, { is_closed: true }, openTill('21:00'), SATURDAY_5PM_EDT);
    expect(hours.closed).toBe(true);
  });

  it('lets a special-hours row override the weekly closing time', () => {
    const hours = resolveTodayHours(DETROIT, { is_closed: false, open_time: '10:00', close_time: '15:00' }, openTill('21:00'), SATURDAY_5PM_EDT);
    expect(hours.closeAt!.toISOString()).toBe('2026-08-01T19:00:00.000Z');
  });

  it('lets a special-hours row open a normally-closed day', () => {
    const hours = resolveTodayHours(DETROIT, { is_closed: false, open_time: '10:00', close_time: '16:00' }, { is_open: false }, SATURDAY_5PM_EDT);
    expect(hours.closed).toBe(false);
  });
});

describe('the reported bug: joining mid-afternoon with an empty queue', () => {
  // Shop open 9am-9pm Detroit. Customer joins at 5pm local with no wait and a
  // 20-minute service, so they'd finish at 5:20pm — nearly four hours before
  // closing. Under the old server-clock math `closeAt` came out as 21:00Z
  // (5pm local), so this was rejected as PAST_CLOSING.
  const hours = resolveTodayHours(DETROIT, null, openTill('21:00'), SATURDAY_5PM_EDT);
  const estimatedFinish = new Date(SATURDAY_5PM_EDT.getTime() + 20 * 60_000);

  it('is not treated as past closing', () => {
    expect(hours.closed).toBe(false);
    expect(exceedsClosingGrace(estimatedFinish, hours.closeAt!, 30)).toBe(false);
  });

  it('still rejects a join that genuinely runs past closing plus grace', () => {
    const longBacklogFinish = new Date('2026-08-02T02:00:00Z'); // 10pm local, an hour past close
    expect(exceedsClosingGrace(longBacklogFinish, hours.closeAt!, 30)).toBe(true);
  });

  it('still allows a join that lands inside the grace window', () => {
    const justAfterClose = new Date('2026-08-02T01:20:00Z'); // 9:20pm local, inside 30m grace
    expect(exceedsClosingGrace(justAfterClose, hours.closeAt!, 30)).toBe(false);
  });
});
