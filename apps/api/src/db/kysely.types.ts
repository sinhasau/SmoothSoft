import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Hand-written to mirror db/migrations/0001-0010 exactly. The migrations are
 * the schema source of truth; this file is kept in sync by hand rather than
 * introspected, since there's no live DB available at codegen time in every
 * environment this runs in. If a migration changes a column, update here too.
 *
 * `Numeric` exists because node-postgres returns NUMERIC columns as strings
 * by default (to avoid float precision loss) but accepts number|string on
 * write.
 */
/**
 * NOTE: this Kysely version's `Generated<S> = ColumnType<S, S | undefined, S>`
 * does NOT flatten a nested ColumnType — wrapping an already-ColumnType
 * alias (Numeric, TimestampTz, ...) in Generated<> produces a type whose
 * Insert/Update value type is itself a ColumnType object, not a plain
 * value, which fails at every call site. Any column that is both a
 * ColumnType AND has a DB-side default must use one of the *WithDefault
 * aliases below directly — never `Generated<TimestampTz>` etc.
 */
type Numeric = ColumnType<string, string | number, string | number>;
type NumericWithDefault = ColumnType<string, string | number | undefined, string | number>;
type TimestampTz = ColumnType<Date, Date | string, Date | string>;
type TimestampTzWithDefault = ColumnType<Date, Date | string | undefined, Date | string>;
type DateOnly = ColumnType<string, string, string>;
type TimeOnly = ColumnType<string, string, string>;

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  legal_structure: string | null;
  allow_staff_multi_location: Generated<boolean>;
  created_at: TimestampTzWithDefault;
}

export interface LocationsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  timezone: Generated<string>;
  created_at: TimestampTzWithDefault;
}

export interface UsersTable {
  id: Generated<string>;
  email: string | null;
  phone: string | null;
  full_name: string;
  created_at: TimestampTzWithDefault;
}

export type StaffRole = 'org_owner' | 'location_manager' | 'staff' | 'front_desk';
export type StaffClassification = 'w2' | '1099';
export type StaffStatus = 'available' | 'busy' | 'break' | 'off';

export interface LocationStaffTable {
  id: Generated<string>;
  location_id: string;
  user_id: string;
  role: StaffRole;
  classification: StaffClassification | null;
  is_primary: Generated<boolean>;
  permission_overrides: Generated<Record<string, boolean>>;
  status: Generated<StaffStatus>;
  created_at: TimestampTzWithDefault;
}

export interface StaffScheduleDaysTable {
  id: Generated<string>;
  location_staff_id: string;
  day_of_week: number;
  start_time: TimeOnly;
  end_time: TimeOnly;
}

export interface StaffCompensationHistoryTable {
  id: Generated<string>;
  location_staff_id: string;
  classification: StaffClassification;
  commission_pct: Numeric | null;
  booth_rent_weekly: Numeric | null;
  effective_from: TimestampTzWithDefault;
  effective_to: TimestampTz | null;
}

export interface StaffGoalsTable {
  location_staff_id: string;
  daily_revenue: Numeric | null;
  clients_per_day: number | null;
}

export interface LocationGoalsTable {
  location_id: string;
  daily_revenue_per_barber: Numeric | null;
  clients_per_day_per_barber: number | null;
  tip_rate_pct: Numeric | null;
  utilization_target_pct: Numeric | null;
}

export interface ClientsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  phone_normalized: string | null;
  phone_display: string | null;
  referral_source: string | null;
  notes: string | null;
  allergy_flag: Generated<boolean>;
  last_confirmed_at: TimestampTz | null;
  created_at: TimestampTzWithDefault;
}

export interface PhoneBindingsTable {
  id: Generated<string>;
  phone_normalized: string;
  client_id: string;
  bound_at: TimestampTzWithDefault;
  superseded_at: TimestampTz | null;
}

export interface GlobalClientAccountsTable {
  id: Generated<string>;
  phone_normalized: string | null;
  email: string | null;
  verified_at: TimestampTz;
  created_at: TimestampTzWithDefault;
}

export interface ClientIdentityLinksTable {
  local_client_id: string;
  global_account_id: string;
  linked_at: TimestampTzWithDefault;
  verification_method: 'sms_otp' | 'email_otp';
}

export interface ServicesTable {
  id: Generated<string>;
  location_id: string;
  name: string;
  duration_minutes: number;
  price: Numeric;
  taxable: Generated<boolean>;
}

export interface ProductsTable {
  id: Generated<string>;
  location_id: string;
  name: string;
  price: Numeric;
  stock_qty: Generated<number>;
}

export interface StoreHoursTable {
  id: Generated<string>;
  location_id: string;
  day_of_week: number;
  is_open: Generated<boolean>;
  open_time: TimeOnly | null;
  close_time: TimeOnly | null;
}

export interface TaxConfigTable {
  location_id: string;
  retail_tax_pct: NumericWithDefault;
  services_taxable: Generated<boolean>;
}

export interface QueueConfigTable {
  location_id: string;
  cleanup_buffer_minutes: Generated<number>;
  overrun_increment_minutes: Generated<number>;
  long_shift_threshold_hours: Generated<number>;
  long_shift_extra_minutes: Generated<number>;
  max_break_minutes: Generated<number>;
  appointment_max_wait_minutes: Generated<number>;
  appt_atrisk_notify_minutes: Generated<number>;
}

export interface LocationSequenceCountersTable {
  location_id: string;
  next_value: NumericWithDefault;
}

export type QueueEventType =
  | 'client_checked_in'
  | 'client_checked_in_undone'
  | 'service_started'
  | 'service_started_undone'
  | 'service_completed'
  | 'service_completed_undone'
  | 'queue_entry_cancelled'
  | 'queue_entry_cancelled_undone'
  | 'queue_entry_no_show'
  | 'queue_entry_no_show_undone'
  | 'queue_entry_abandoned'
  | 'queue_entry_abandoned_undone'
  | 'queue_entry_reassigned'
  | 'queue_entry_reordered'
  | 'queue_entry_present_toggled'
  | 'queue_entry_returned_to_waiting'
  | 'staff_status_changed'
  | 'staff_clocked_in'
  | 'shop_closed';

export interface EventsTable {
  id: Generated<string>;
  location_id: string;
  sequence_no: Numeric;
  event_type: QueueEventType;
  entity_id: string | null;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: TimestampTzWithDefault;
}

export type QueueEntryStatus = 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'no_show';

export interface QueueEntriesTable {
  id: Generated<string>;
  location_id: string;
  client_id: string | null;
  guest_name: string | null;
  service_id: string | null;
  status: QueueEntryStatus;
  assigned_location_staff_id: string | null;
  is_appt: Generated<boolean>;
  appt_at: TimestampTz | null;
  present: Generated<boolean>;
  present_checked_at: TimestampTz | null;
  present_projected_at: TimestampTz | null;
  abandoned: Generated<boolean>;
  waiting_order: number | null;
  original_waiting_order: number | null;
  service_notes: string | null;
  created_at: TimestampTzWithDefault;
  updated_at: TimestampTzWithDefault;
}

export type PaymentMethod = 'card' | 'cash' | 'external';

export interface TransactionsTable {
  id: Generated<string>;
  location_id: string;
  client_id: string | null;
  location_staff_id: string | null;
  queue_entry_id: string | null;
  subtotal: Numeric;
  tax: NumericWithDefault;
  tip: NumericWithDefault;
  total: Numeric;
  payment_method: PaymentMethod;
  payment_processor_ref: string | null;
  discount_code_id: string | null;
  discount_amount: NumericWithDefault;
  created_at: TimestampTzWithDefault;
}

export type DiscountType = 'percent' | 'flat';

export interface DiscountCodesTable {
  id: Generated<string>;
  location_id: string;
  code: string;
  discount_type: DiscountType;
  value: Numeric;
  active: Generated<boolean>;
  expires_at: DateOnly | null;
  usage_count: Generated<number>;
  created_at: TimestampTzWithDefault;
}

export interface TransactionItemsTable {
  id: Generated<string>;
  transaction_id: string;
  name: string;
  item_type: 'service' | 'retail';
  price: Numeric;
  taxable: Generated<boolean>;
}

export interface RefundsTable {
  id: Generated<string>;
  original_transaction_id: string;
  amount: Numeric;
  reason: string | null;
  created_at: TimestampTzWithDefault;
}

export interface ScheduleExceptionsTable {
  id: Generated<string>;
  location_staff_id: string;
  location_id: string;
  work_date: DateOnly;
  is_working: boolean;
  start_time: TimeOnly | null;
  end_time: TimeOnly | null;
  reason: string | null;
  created_at: TimestampTzWithDefault;
}

export type ScheduleRequestType = 'one_time' | 'recurring';
export type ScheduleRequestStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';

export interface ScheduleChangeRequestsTable {
  id: Generated<string>;
  location_staff_id: string;
  location_id: string;
  request_type: ScheduleRequestType;
  status: Generated<ScheduleRequestStatus>;
  work_date: DateOnly | null;
  day_of_week: number | null;
  is_working: boolean;
  start_time: TimeOnly | null;
  end_time: TimeOnly | null;
  reason: string | null;
  requested_by_user_id: string | null;
  decided_by_user_id: string | null;
  decided_at: TimestampTz | null;
  created_at: TimestampTzWithDefault;
}

export type ComplianceDocStatus = 'valid' | 'needs_attention' | 'overdue';

export interface ComplianceDocumentsTable {
  id: Generated<string>;
  location_id: string;
  location_staff_id: string | null;
  doc_type: string;
  description: string | null;
  expires_at: DateOnly | null;
  last_updated_at: TimestampTzWithDefault;
  status: Generated<ComplianceDocStatus>;
  created_at: TimestampTzWithDefault;
}

export type ActiveProcessor = 'stripe' | 'square' | 'external';

export interface PaymentProcessorConfigTable {
  location_id: string;
  active_processor: Generated<ActiveProcessor>;
  stripe_publishable_key: string | null;
  stripe_connected_account_id: string | null;
  square_application_id: string | null;
  square_location_id: string | null;
  card_fee_pct: NumericWithDefault;
  starting_cash_float: NumericWithDefault;
  updated_at: TimestampTzWithDefault;
}

export interface ShopClosingsTable {
  id: Generated<string>;
  location_id: string;
  closed_by_user_id: string | null;
  closing_date: DateOnly;
  starting_float: Numeric;
  cash_sales_total: Numeric;
  expected_cash: Numeric;
  actual_cash_count: Numeric;
  variance: Numeric;
  card_sales_total: Numeric;
  estimated_card_fee: Numeric;
  tasks_completed: Generated<string[]>;
  created_at: TimestampTzWithDefault;
}

export interface DB {
  organizations: OrganizationsTable;
  locations: LocationsTable;
  users: UsersTable;
  location_staff: LocationStaffTable;
  staff_schedule_days: StaffScheduleDaysTable;
  staff_compensation_history: StaffCompensationHistoryTable;
  staff_goals: StaffGoalsTable;
  location_goals: LocationGoalsTable;
  clients: ClientsTable;
  phone_bindings: PhoneBindingsTable;
  global_client_accounts: GlobalClientAccountsTable;
  client_identity_links: ClientIdentityLinksTable;
  services: ServicesTable;
  products: ProductsTable;
  store_hours: StoreHoursTable;
  tax_config: TaxConfigTable;
  queue_config: QueueConfigTable;
  location_sequence_counters: LocationSequenceCountersTable;
  events: EventsTable;
  queue_entries: QueueEntriesTable;
  transactions: TransactionsTable;
  transaction_items: TransactionItemsTable;
  refunds: RefundsTable;
  schedule_exceptions: ScheduleExceptionsTable;
  schedule_change_requests: ScheduleChangeRequestsTable;
  compliance_documents: ComplianceDocumentsTable;
  payment_processor_config: PaymentProcessorConfigTable;
  discount_codes: DiscountCodesTable;
  shop_closings: ShopClosingsTable;
}

export type Organization = Selectable<OrganizationsTable>;
export type Location = Selectable<LocationsTable>;
export type User = Selectable<UsersTable>;
export type LocationStaff = Selectable<LocationStaffTable>;
export type QueueEntry = Selectable<QueueEntriesTable>;
export type QueueEntryInsert = Insertable<QueueEntriesTable>;
export type QueueEntryUpdate = Updateable<QueueEntriesTable>;
export type Client = Selectable<ClientsTable>;
export type Service = Selectable<ServicesTable>;
export type Transaction = Selectable<TransactionsTable>;
export type EventRow = Selectable<EventsTable>;
