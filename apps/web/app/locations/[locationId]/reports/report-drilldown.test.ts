import { describe, expect, it } from 'vitest';
import { reportDrilldownHref } from './report-drilldown';

describe('report drill-down destinations', () => {
  const locationId = 'loc-1';

  it('prefers exact staff and client records when a row identifies one', () => {
    expect(reportDrilldownHref('revenue_by_staff', { locationStaffId: 'staff-1' }, locationId)).toBe('/locations/loc-1/staff/staff-1');
    expect(reportDrilldownHref('top_clients', { clientId: 'client-1' }, locationId)).toBe('/locations/loc-1/clients/client-1');
  });

  it('routes operational values to their supporting workflow', () => {
    expect(reportDrilldownHref('no_show_trend', {}, locationId)).toBe('/locations/loc-1/appointments');
    expect(reportDrilldownHref('staff_scheduled_hours', {}, locationId)).toBe('/locations/loc-1/schedule');
    expect(reportDrilldownHref('compliance_status', {}, locationId)).toBe('/locations/loc-1/staff');
    expect(reportDrilldownHref('tax_documentation', {}, locationId)).toBe('/locations/loc-1/settings#payroll');
  });

  it('routes financial values to transaction detail', () => {
    expect(reportDrilldownHref('revenue_trend', {}, locationId)).toBe('/locations/loc-1/sales');
    expect(reportDrilldownHref('discount_usage', {}, locationId)).toBe('/locations/loc-1/sales');
  });
});
