export interface StoreHoursDayDto {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
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
  selfServeDefault: boolean;
}

export interface UpdateStaffSchedulingOverrideDto {
  /** null clears the override, falling back to the location default. */
  selfServeOverride: boolean | null;
}

export interface UpdatePricingPolicyDto {
  barberRequestMode: 'same' | 'per_staff' | 'flat';
  flatSurchargeAmount: number;
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
  role: 'org_owner' | 'location_manager' | 'staff' | 'front_desk';
  classification: 'w2' | '1099';
  commissionPct?: number;
  boothRentWeekly?: number;
  dailyRevenueGoal?: number;
  clientsPerDayGoal?: number;
  schedule?: ScheduleDayDto[];
}

export interface UpdateStaffCompensationDto {
  classification: 'w2' | '1099';
  commissionPct?: number;
  boothRentWeekly?: number;
}

export interface UpdateStaffGoalsDto {
  dailyRevenue?: number;
  clientsPerDay?: number;
}

export interface UpdateComplianceDocumentDto {
  status?: 'valid' | 'needs_attention' | 'overdue';
  expiresAt?: string | null;
  description?: string | null;
}
