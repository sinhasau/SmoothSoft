export interface OwnerAssignment {
  locationStaffId: string;
  userId: string;
  fullName: string;
  role: 'org_owner' | 'location_manager' | 'staff' | 'front_desk';
  classification: 'w2' | '1099' | null;
  employmentStatus: 'active' | 'inactive' | 'resigned';
  floorStatus: 'available' | 'busy' | 'break' | 'off';
  isPrimary: boolean;
  locationId: string;
  locationName: string;
  compensationModel: string;
  commissionPct: number | null;
  boothRentWeekly: number | null;
  hourlyRate: number | null;
  annualSalary: number | null;
}

export interface OwnerPerson {
  userId: string;
  fullName: string;
  role: OwnerAssignment['role'];
  classification: OwnerAssignment['classification'];
  employmentStatus: OwnerAssignment['employmentStatus'];
  assignments: OwnerAssignment[];
}

export interface OwnerLocation {
  locationId: string;
  locationName: string;
  clientsServed: number;
  revenue: number;
  staffOnShift: number;
  staffTotal: number;
  complianceStatus: 'compliant' | 'needs_attention' | 'overdue';
  complianceAlerts: number;
  w2Count: number;
  contractorCount: number;
  serviceRevenue: number;
  retailRevenue: number;
  discount: number;
  tax: number;
  tips: number;
  pendingScheduleRequests: number;
}

export interface OwnerDashboard {
  /**
   * Optional on purpose, even though the current API always sends it.
   *
   * The web app and the API deploy independently (Vercel and Render), so a
   * newer web build routinely runs against an older API for a few minutes.
   * `organization` was added after `locations` and `totals`, and reading
   * `data.organization.name` on a response that predates it threw
   * "Cannot read properties of undefined" inside the shared org layout —
   * blanking the entire owner workspace, not just one page.
   *
   * Marking it optional makes TypeScript refuse any access that would repeat
   * that. Same reasoning applies to anything else added later.
   */
  organization?: { id: string; name: string };
  locations: OwnerLocation[];
  totals: {
    revenueToday: number;
    clientsServed: number;
    staffOnShift: number;
    staffTotal: number;
    complianceAlerts: number;
    w2Count: number;
    contractorCount: number;
    serviceRevenue: number;
    retailRevenue: number;
    discount: number;
    salesTax: number;
    tips: number;
  };
  team: OwnerPerson[];
  actionItems: Array<{ id: string; tone: 'amber' | 'red'; title: string; href: string }>;
}
