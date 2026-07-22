export interface StoreHoursDayDto {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface UpsertSpecialHoursDto {
  date: string;
  label?: string | null;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
}

export interface UpsertServiceDto {
  name: string;
  durationMinutes: number;
  price: number;
  taxable?: boolean;
}

export interface UpsertProductDto {
  name: string;
  price: number;
  stockQty?: number;
}

export interface UpsertDiscountCodeDto {
  code: string;
  discountType: 'percent' | 'flat';
  value: number;
  active?: boolean;
  expiresAt?: string | null;
}

export interface UpdateSchedulingPolicyDto {
  selfServeDefault?: boolean;
  overtimeThresholdHours?: number;
  minimumCoverage?: number;
  chairCount?: number;
  baseHourlyLaborCost?: number;
  payrollBurdenPct?: number;
}

export interface UpdateFeatureSettingsDto {
  retailProductsEnabled?: boolean;
  discountCodesEnabled?: boolean;
}

export interface UpdateCommunicationSettingsDto {
  enabled?: boolean;
  bookingConfirmations?: boolean;
  appointmentReminders?: boolean;
}

export interface UpdateSanitationSettingsDto {
  enabled?: boolean;
  intervalHours?: number;
}

export interface UpdatePayrollSettingsDto {
  scheduleName: string;
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  anchorDate: string;
  workweekStartsOn: number;
  paydayOffsetBusinessDays: number;
}

export interface UpdateStaffSchedulingOverrideDto {
  /** null clears the override, falling back to the location default. */
  selfServeOverride: boolean | null;
}

export interface UpdateStaffEmploymentStatusDto {
  employmentStatus: 'active' | 'inactive' | 'resigned';
}

export interface UpdatePricingPolicyDto {
  barberRequestMode: 'same' | 'per_staff' | 'flat';
  flatSurchargeAmount: number;
  creditSurchargeToStaff: boolean;
}

export interface UpdateStaffPriceTierDto {
  priceTierAmount: number;
}

export interface UpdateTaxConfigDto {
  retailTaxPct: number;
  servicesTaxable: boolean;
}

export interface UpdateQueueConfigDto {
  cleanupBufferMinutes?: number;
  overrunIncrementMinutes?: number;
  longShiftThresholdHours?: number;
  longShiftExtraMinutes?: number;
  maxBreakMinutes?: number;
  appointmentMaxWaitMinutes?: number;
  apptAtriskNotifyMinutes?: number;
}

export interface UpdateMatchingPolicyDto {
  continuityWeight: number;
}

export interface UpdateLocationGoalsDto {
  dailyRevenuePerBarber?: number;
  clientsPerDayPerBarber?: number;
  tipRatePct?: number;
  utilizationTargetPct?: number;
}

/** Partial update — omitted fields keep their current values (the service merges with the existing row). */
export interface UpdatePaymentProcessorConfigDto {
  activeProcessor?: 'stripe' | 'square' | 'external';
  stripePublishableKey?: string | null;
  stripeConnectedAccountId?: string | null;
  squareApplicationId?: string | null;
  squareLocationId?: string | null;
  cardFeePct?: number;
  startingCashFloat?: number;
  showDiscountAtCheckout?: boolean;
}

export interface ScheduleDayDto {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AddStaffDto {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: 'org_owner' | 'location_manager' | 'staff' | 'front_desk';
  classification: 'w2' | '1099';
  employmentStatus?: 'active' | 'inactive';
  hireDate?: string | null;
  jobRoleId?: string | null;
  socialSecurityNumber?: string;
  commissionPct?: number;
  boothRentWeekly?: number;
  hourlyRate?: number;
  annualSalary?: number;
  customPayModelId?: string | null;
  dailyRevenueGoal?: number;
  clientsPerDayGoal?: number;
  schedule?: ScheduleDayDto[];
  complianceDocuments?: AddComplianceDocumentDto[];
}

export interface UpdateStaffCompensationDto {
  classification: 'w2' | '1099';
  commissionPct?: number;
  boothRentWeekly?: number;
  hourlyRate?: number;
  annualSalary?: number;
  customPayModelId?: string | null;
}

export interface AddPayModelDto {
  name: string;
  calculationType: 'commission' | 'booth_rent' | 'hourly' | 'salary';
  defaultAmount: number;
}

export interface AddJobRoleDto {
  name: string;
  permissionRole: 'location_manager' | 'staff' | 'front_desk';
}

export interface UpdateStaffTaxIdentityDto { socialSecurityNumber: string }
export interface UpdateStaffJobRoleDto { role: 'location_manager' | 'staff' | 'front_desk'; jobRoleId?: string | null }

export interface UpdateStaffGoalsDto {
  dailyRevenue?: number;
  clientsPerDay?: number;
}

export interface UpdateComplianceDocumentDto {
  status?: 'valid' | 'needs_attention' | 'overdue';
  expiresAt?: string | null;
  issuedAt?: string | null;
  description?: string | null;
}

export interface AddComplianceDocumentDto {
  docType: string;
  description?: string | null;
  expiresAt?: string | null;
  issuedAt?: string | null;
  status?: 'valid' | 'needs_attention' | 'overdue';
}
