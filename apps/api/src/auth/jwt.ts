import jwt from 'jsonwebtoken';
import type { AuthClaims } from './auth.types';

const COOKIE_NAME = 'salon_session';

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'change_me_dev_only') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to a real value in production.');
    }
  }
  return s ?? 'change_me_dev_only';
}

export function signSessionToken(claims: AuthClaims): string {
  return jwt.sign(claims, secret(), { expiresIn: '12h' });
}

export function verifySessionToken(token: string): AuthClaims | null {
  try {
    return jwt.verify(token, secret()) as AuthClaims;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
