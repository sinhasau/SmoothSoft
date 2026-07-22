import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptSsn, encryptSsn, maskSsn, normalizeSsn } from './staff-pii';

describe('employee tax identity protection', () => {
  const prior = process.env.STAFF_PII_ENCRYPTION_KEY;
  beforeEach(() => { process.env.STAFF_PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); });
  afterEach(() => { if (prior) process.env.STAFF_PII_ENCRYPTION_KEY = prior; else delete process.env.STAFF_PII_ENCRYPTION_KEY; });

  it('normalizes, encrypts with record-bound authentication, and masks SSNs', () => {
    const ssn = normalizeSsn('123-45-6789');
    const encrypted = encryptSsn(ssn, 'staff-a');
    expect(encrypted).not.toContain(ssn);
    expect(decryptSsn(encrypted, 'staff-a')).toBe(ssn);
    expect(() => decryptSsn(encrypted, 'staff-b')).toThrow();
    expect(maskSsn(ssn.slice(-4))).toBe('***-**-6789');
  });

  it('rejects structurally invalid SSNs', () => {
    expect(() => normalizeSsn('000-12-3456')).toThrow();
    expect(() => normalizeSsn('123-00-4567')).toThrow();
    expect(() => normalizeSsn('1234')).toThrow();
  });
});
