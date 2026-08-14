import { describe, expect, it } from 'vitest';
import { ORG_SETTING_FIELDS, fieldByKey, parseSettingValue } from './org-settings-fields';

describe('the org settings registry', () => {
  it('gives every field a unique key', () => {
    const keys = ORG_SETTING_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('maps every field to a real per-location destination', () => {
    for (const field of ORG_SETTING_FIELDS) {
      expect(field.locationTable, field.key).toBeTruthy();
      expect(field.locationColumn, field.key).toBeTruthy();
      expect(field.orgColumn, field.key).toBeTruthy();
    }
  });

  it('excludes settings that must differ per shop', () => {
    // Not an oversight — propagating these across an organization would be
    // wrong. Sales tax is jurisdictional, hours differ per shop, chair count
    // is physical, and processor config is per-location payouts.
    const columns = ORG_SETTING_FIELDS.map((f) => f.locationColumn);
    const tables = new Set(ORG_SETTING_FIELDS.map((f) => f.locationTable));
    for (const forbidden of ['tax_rate', 'chair_count', 'opens_at', 'closes_at']) {
      expect(columns, `${forbidden} must not be org-propagated`).not.toContain(forbidden);
    }
    expect(tables.has('tax_config' as never)).toBe(false);
    expect(tables.has('store_hours' as never)).toBe(false);
    expect(tables.has('payment_processor_config' as never)).toBe(false);
  });

  it('gives every numeric field the bounds its CHECK constraint enforces', () => {
    // A default that saved at the org level and then failed on push would
    // leave the two permanently out of sync.
    for (const field of ORG_SETTING_FIELDS.filter((f) => f.type === 'number')) {
      expect(field.min, field.key).toBeTypeOf('number');
      expect(field.max, field.key).toBeTypeOf('number');
    }
  });

  it('gives every enum field its allowed options', () => {
    for (const field of ORG_SETTING_FIELDS.filter((f) => f.type === 'enum')) {
      expect(field.options?.length, field.key).toBeGreaterThan(1);
    }
  });

  it('looks a field up by key, and returns undefined for anything else', () => {
    expect(fieldByKey('discount_codes_enabled')?.label).toBe('Discount codes');
    expect(fieldByKey('nope')).toBeUndefined();
    expect(fieldByKey('')).toBeUndefined();
  });
});

describe('parseSettingValue', () => {
  const bool = fieldByKey('discount_codes_enabled')!;
  const burden = fieldByKey('payroll_burden_pct')!;
  const mode = fieldByKey('barber_request_mode')!;
  const interval = fieldByKey('sanitation_interval_hours')!;

  it('accepts a valid boolean', () => {
    expect(parseSettingValue(bool, true)).toEqual({ ok: true, value: true });
    expect(parseSettingValue(bool, false)).toEqual({ ok: true, value: false });
  });

  it('rejects a truthy non-boolean rather than coercing it', () => {
    // "false" and 0 coerce in surprising directions; a feature flag is exactly
    // where that must not happen.
    for (const bad of ['true', 'false', 1, 0, {}]) {
      expect(parseSettingValue(bool, bad).ok, String(bad)).toBe(false);
    }
  });

  it('accepts a number in range, at both boundaries', () => {
    expect(parseSettingValue(burden, 0)).toEqual({ ok: true, value: 0 });
    expect(parseSettingValue(burden, 100)).toEqual({ ok: true, value: 100 });
    expect(parseSettingValue(burden, 12.5)).toEqual({ ok: true, value: 12.5 });
  });

  it('rejects a number outside the range the database would reject', () => {
    expect(parseSettingValue(burden, -1).ok).toBe(false);
    expect(parseSettingValue(burden, 101).ok).toBe(false);
    expect(parseSettingValue(interval, 0).ok).toBe(false);
    expect(parseSettingValue(interval, 9).ok).toBe(false);
  });

  it('accepts a numeric string, because a form sends strings', () => {
    expect(parseSettingValue(burden, '12')).toEqual({ ok: true, value: 12 });
  });

  it('rejects a non-numeric string instead of storing NaN', () => {
    for (const bad of ['', '   ', 'abc', '12abc', null, undefined, {}, []]) {
      expect(parseSettingValue(burden, bad).ok, String(bad)).toBe(false);
    }
  });

  it('accepts every declared enum option and nothing else', () => {
    for (const option of mode.options!) {
      expect(parseSettingValue(mode, option)).toEqual({ ok: true, value: option });
    }
    expect(parseSettingValue(mode, 'SAME').ok).toBe(false);
    expect(parseSettingValue(mode, 'free').ok).toBe(false);
    expect(parseSettingValue(mode, 1).ok).toBe(false);
  });

  it('names the field in its error, so the message is usable', () => {
    const result = parseSettingValue(burden, 500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Payroll burden');
  });

  it('rejects null and undefined for every field type', () => {
    // Clearing a value is not what this endpoint does; a missing value is a
    // malformed request, not an instruction to erase the default.
    for (const field of ORG_SETTING_FIELDS) {
      expect(parseSettingValue(field, null).ok, field.key).toBe(false);
      expect(parseSettingValue(field, undefined).ok, field.key).toBe(false);
    }
  });
});
