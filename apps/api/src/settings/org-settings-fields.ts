/**
 * The registry of settings an owner can set organization-wide.
 *
 * Every entry maps one field to its column in `organization_settings` and to
 * the per-location table/column it corresponds to. Keeping that mapping in one
 * declarative list is what makes "only update the changed setting and override
 * nothing else" enforceable instead of aspirational: a push updates exactly
 * `locationColumn` on exactly `locationTable`, so a shop's other values —
 * including ones it has deliberately customised — are never touched.
 *
 * What is deliberately NOT here matters as much as what is. Sales tax is
 * jurisdictional, store hours differ per shop, chair count is physical, and
 * payment processor config is per-location payouts. Propagating any of those
 * across an organization would be wrong, so they are absent by decision, not
 * by omission. Adding a field here should mean asking "would a two-shop owner
 * ever want these to differ?" and only adding it if the answer is no.
 */
export type OrgSettingType = 'boolean' | 'number' | 'enum';

export interface OrgSettingField {
  key: string;
  label: string;
  group: string;
  help: string;
  type: OrgSettingType;
  /** Column on `organization_settings`. */
  orgColumn: string;
  /** The per-location table this pushes into. */
  locationTable:
    | 'location_feature_settings'
    | 'location_scheduling_policy'
    | 'location_pricing_policy'
    | 'location_communication_settings'
    | 'location_sanitation_settings';
  locationColumn: string;
  /** Bounds, mirroring the CHECK constraints on both tables. */
  min?: number;
  max?: number;
  options?: readonly string[];
  /** Rendered next to a number field, e.g. "$" or "%". */
  unit?: string;
}

export const ORG_SETTING_FIELDS: readonly OrgSettingField[] = [
  {
    key: 'retail_products_enabled',
    label: 'Retail products',
    group: 'Features',
    help: 'Whether shops can sell retail products alongside services.',
    type: 'boolean',
    orgColumn: 'retail_products_enabled',
    locationTable: 'location_feature_settings',
    locationColumn: 'retail_products_enabled',
  },
  {
    key: 'discount_codes_enabled',
    label: 'Discount codes',
    group: 'Features',
    help: 'Whether discount codes can be applied at checkout.',
    type: 'boolean',
    orgColumn: 'discount_codes_enabled',
    locationTable: 'location_feature_settings',
    locationColumn: 'discount_codes_enabled',
  },
  {
    key: 'self_serve_default',
    label: 'Staff self-serve scheduling',
    group: 'Scheduling',
    help: 'Whether staff can edit their own availability by default.',
    type: 'boolean',
    orgColumn: 'self_serve_default',
    locationTable: 'location_scheduling_policy',
    locationColumn: 'self_serve_default',
  },
  {
    key: 'base_hourly_labor_cost',
    label: 'Base hourly labor cost',
    group: 'Scheduling',
    help: 'Used to estimate the cost of a shift when building a schedule.',
    type: 'number',
    orgColumn: 'base_hourly_labor_cost',
    locationTable: 'location_scheduling_policy',
    locationColumn: 'base_hourly_labor_cost',
    min: 0,
    max: 1000,
    unit: '$',
  },
  {
    key: 'payroll_burden_pct',
    label: 'Payroll burden',
    group: 'Scheduling',
    help: 'Taxes and overhead added on top of wages in labor-cost estimates.',
    type: 'number',
    orgColumn: 'payroll_burden_pct',
    locationTable: 'location_scheduling_policy',
    locationColumn: 'payroll_burden_pct',
    min: 0,
    max: 100,
    unit: '%',
  },
  {
    key: 'barber_request_mode',
    label: 'Requesting a specific barber',
    group: 'Pricing',
    help: 'same — no surcharge · per_staff — each barber sets their own · flat — one organization-wide surcharge.',
    type: 'enum',
    orgColumn: 'barber_request_mode',
    locationTable: 'location_pricing_policy',
    locationColumn: 'barber_request_mode',
    options: ['same', 'per_staff', 'flat'],
  },
  {
    key: 'flat_surcharge_amount',
    label: 'Flat request surcharge',
    group: 'Pricing',
    help: 'Charged when requesting a specific barber, if the mode above is "flat".',
    type: 'number',
    orgColumn: 'flat_surcharge_amount',
    locationTable: 'location_pricing_policy',
    locationColumn: 'flat_surcharge_amount',
    min: 0,
    max: 1000,
    unit: '$',
  },
  {
    key: 'communications_enabled',
    label: 'Client messaging',
    group: 'Messages',
    help: 'Master switch for automated messages to clients.',
    type: 'boolean',
    orgColumn: 'communications_enabled',
    locationTable: 'location_communication_settings',
    locationColumn: 'enabled',
  },
  {
    key: 'booking_confirmations',
    label: 'Booking confirmations',
    group: 'Messages',
    help: 'Send a confirmation when a client books.',
    type: 'boolean',
    orgColumn: 'booking_confirmations',
    locationTable: 'location_communication_settings',
    locationColumn: 'booking_confirmations',
  },
  {
    key: 'appointment_reminders',
    label: 'Appointment reminders',
    group: 'Messages',
    help: 'Remind clients ahead of an upcoming appointment.',
    type: 'boolean',
    orgColumn: 'appointment_reminders',
    locationTable: 'location_communication_settings',
    locationColumn: 'appointment_reminders',
  },
  {
    key: 'sanitation_enabled',
    label: 'Sanitation reminders',
    group: 'Sanitation',
    help: 'Prompt staff to sanitize on a recurring interval.',
    type: 'boolean',
    orgColumn: 'sanitation_enabled',
    locationTable: 'location_sanitation_settings',
    locationColumn: 'enabled',
  },
  {
    key: 'sanitation_interval_hours',
    label: 'Sanitation interval',
    group: 'Sanitation',
    help: 'How often the reminder repeats during a shift.',
    type: 'number',
    orgColumn: 'sanitation_interval_hours',
    locationTable: 'location_sanitation_settings',
    locationColumn: 'interval_hours',
    min: 1,
    max: 8,
    unit: 'hours',
  },
];

export function fieldByKey(key: string): OrgSettingField | undefined {
  return ORG_SETTING_FIELDS.find((field) => field.key === key);
}

export type ParsedValue = boolean | number | string;

/**
 * Validates a submitted value against the field's own bounds.
 *
 * These mirror the CHECK constraints on both tables. Checking here rather than
 * letting Postgres reject it is the difference between a readable message and
 * a 500 — and a value that saved at the org level but failed on push would
 * leave the two out of sync.
 */
export function parseSettingValue(
  field: OrgSettingField,
  raw: unknown,
): { ok: true; value: ParsedValue } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: false, error: `${field.label} needs a value.` };
  }

  if (field.type === 'boolean') {
    if (typeof raw !== 'boolean') return { ok: false, error: `${field.label} must be true or false.` };
    return { ok: true, value: raw };
  }

  if (field.type === 'enum') {
    if (typeof raw !== 'string' || !field.options?.includes(raw)) {
      return { ok: false, error: `${field.label} must be one of: ${field.options?.join(', ')}.` };
    }
    return { ok: true, value: raw };
  }

  // Numbers arrive from JSON as numbers, but a form can send "12" — accept a
  // numeric string, reject anything that is not actually a number.
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return { ok: false, error: `${field.label} must be a number.` };
  if (field.min !== undefined && value < field.min) {
    return { ok: false, error: `${field.label} cannot be below ${field.min}.` };
  }
  if (field.max !== undefined && value > field.max) {
    return { ok: false, error: `${field.label} cannot be above ${field.max}.` };
  }
  return { ok: true, value };
}
