import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthClaims } from './auth.types';

const claims: AuthClaims = {
  userId: 'user_1',
  locationStaffId: 'staff_1',
  organizationId: 'org_1',
  locationId: 'loc_1',
  role: 'org_owner',
  fullName: 'Jordan Test',
};

describe('signSessionToken / verifySessionToken', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.JWT_SECRET = 'a-real-test-secret';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    process.env.NODE_ENV = originalEnv;
  });

  it('round-trips claims through sign and verify', async () => {
    const { signSessionToken, verifySessionToken } = await import('./jwt.js');
    const token = signSessionToken(claims);
    expect(verifySessionToken(token)).toMatchObject(claims);
  });

  it('returns null for a tampered token', async () => {
    const { signSessionToken, verifySessionToken } = await import('./jwt.js');
    const token = signSessionToken(claims);
    expect(verifySessionToken(`${token}x`)).toBeNull();
  });

  it('returns null for garbage input instead of throwing', async () => {
    const { verifySessionToken } = await import('./jwt.js');
    expect(verifySessionToken('not-a-jwt')).toBeNull();
  });

  it('refuses to sign in production with no JWT_SECRET set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    const { signSessionToken } = await import('./jwt.js');
    expect(() => signSessionToken(claims)).toThrow(/JWT_SECRET must be set/);
  });

  it('refuses to sign in production when JWT_SECRET is still the dev default', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'change_me_dev_only';
    const { signSessionToken } = await import('./jwt.js');
    expect(() => signSessionToken(claims)).toThrow(/JWT_SECRET must be set/);
  });

  it('falls back to the dev secret outside production when unset', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const { signSessionToken, verifySessionToken } = await import('./jwt.js');
    const token = signSessionToken(claims);
    expect(verifySessionToken(token)).toMatchObject(claims);
  });
});
