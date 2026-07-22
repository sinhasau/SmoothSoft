import { describe, expect, it } from 'vitest';
import { paySchedule, payrollPeriod } from './payroll-period';

describe('payrollPeriod', () => {
  it('computes a stable biweekly period and pay date from its anchor', () => {
    expect(payrollPeriod('2026-07-13', 14, 5, new Date('2026-07-21T18:00:00Z'))).toEqual({ currentPeriodStart: '2026-07-13', currentPeriodEnd: '2026-07-26', nextPayDate: '2026-07-31' });
  });

  it('builds a semimonthly preview and moves payday by business days', () => {
    expect(paySchedule('semimonthly', '2026-01-01', 2, new Date('2026-07-21T18:00:00Z')).upcomingPeriods.slice(0, 2)).toEqual([
      { periodStart: '2026-07-16', periodEnd: '2026-07-31', payDate: '2026-08-04' },
      { periodStart: '2026-08-01', periodEnd: '2026-08-15', payDate: '2026-08-18' },
    ]);
  });
});
