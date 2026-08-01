import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('strips punctuation and whitespace from a formatted US number', () => {
    expect(normalizePhone('(313) 555-0142')).toBe('3135550142');
  });

  it('strips a leading country code prefix character but keeps the digits', () => {
    expect(normalizePhone('+1 313-555-0142')).toBe('13135550142');
  });

  it('returns an empty string when given no digits', () => {
    expect(normalizePhone('abc-def')).toBe('');
  });

  it('leaves an already-normalized string unchanged', () => {
    expect(normalizePhone('3135550142')).toBe('3135550142');
  });

  it('drops embedded letters or extensions', () => {
    expect(normalizePhone('313.555.0142 ext 22')).toBe('313555014222');
  });
});
