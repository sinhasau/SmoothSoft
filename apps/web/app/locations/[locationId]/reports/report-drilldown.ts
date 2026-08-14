export type DrilldownReportId =
  | 'revenue_trend'
  | 'revenue_by_staff'
  | 'payment_mix'
  | 'discount_usage'
  | 'no_show_trend'
  | 'staff_scheduled_hours'
  | 'compliance_status'
  | 'top_clients'
  | 'new_vs_returning'
  | 'top_services_products'
  | 'tax_documentation';

export function reportDrilldownHref(reportId: DrilldownReportId, row: Record<string, any>, locationId: string): string {
  if (row.locationStaffId) return `/locations/${locationId}/staff/${row.locationStaffId}`;
  if (row.clientId) return `/locations/${locationId}/clients/${row.clientId}`;
  if (reportId === 'no_show_trend') return `/locations/${locationId}/appointments`;
  if (reportId === 'new_vs_returning' || reportId === 'top_clients') return `/locations/${locationId}/clients`;
  if (reportId === 'staff_scheduled_hours') return `/locations/${locationId}/schedule`;
  if (reportId === 'compliance_status') return `/locations/${locationId}/staff`;
  if (reportId === 'tax_documentation') return `/locations/${locationId}/settings#payroll`;
  return `/locations/${locationId}/sales`;
}
