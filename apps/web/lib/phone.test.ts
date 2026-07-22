import { describe, expect, it } from 'vitest';
import { formatPhoneInput } from './phone';

describe('formatPhoneInput', () => {
  it('adds dashes to pasted and progressively typed US numbers', () => {
    expect(formatPhoneInput('3135551212')).toBe('313-555-1212');
    expect(formatPhoneInput('3135')).toBe('313-5');
    expect(formatPhoneInput('(313) 555-1212')).toBe('313-555-1212');
  });

  it('formats a leading North American country code', () => {
    expect(formatPhoneInput('13135551212')).toBe('1-313-555-1212');
  });

  it('does not rewrite explicitly international input', () => {
    expect(formatPhoneInput('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});
