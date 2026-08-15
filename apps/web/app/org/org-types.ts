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
  /** null when withheld by the visibility rule, versus an object of nulls for "not on file". */
  contact?: StaffContact | null;
  commissionPct: number | null;
  boothRentWeekly: number | null;
  hourlyRate: number | null;
  annualSalary: number | null;
}

export interface StaffContact {
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface OwnerPerson {
  userId: string;
  fullName: string;
  /**
   * Person-level role/classification/status are only set when EVERY assignment
   * agrees. When they disagree these are null and the matching `mixed*` flag is
   * true — the API refuses to invent a consensus, because it used to report
   * whichever location sorted first and could show a 1099 barber as W-2.
   */
  role: OwnerAssignment['role'] | null;
  classification: OwnerAssignment['classification'];
  employmentStatus: OwnerAssignment['employmentStatus'] | null;
  mixedRole: boolean;
  mixedClassification: boolean;
  mixedEmploymentStatus: boolean;
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
  address?: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    phone: string | null;
  } | null;
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
