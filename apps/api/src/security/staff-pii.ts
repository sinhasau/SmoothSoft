import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function key(): Buffer {
  const encoded = process.env.STAFF_PII_ENCRYPTION_KEY;
  if (!encoded) {
    if (process.env.NODE_ENV !== 'production' && process.env.JWT_SECRET) return createHash('sha256').update(`smoothsoft-dev-staff-pii:${process.env.JWT_SECRET}`).digest();
    throw new Error('STAFF_PII_ENCRYPTION_KEY is required to store employee tax identity data');
  }
  const value = Buffer.from(encoded, 'base64');
  if (value.length !== 32) throw new Error('STAFF_PII_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return value;
}

export function normalizeSsn(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) throw new Error('Enter a valid 9-digit Social Security number');
  const area = Number(digits.slice(0, 3));
  if (area === 0 || area === 666 || area >= 900 || digits.slice(3, 5) === '00' || digits.slice(5) === '0000') throw new Error('Enter a valid Social Security number');
  return digits;
}

export function maskSsn(lastFour: string): string { return `***-**-${lastFour}`; }

export function encryptSsn(ssn: string, locationStaffId: string): string {
  const normalized = normalizeSsn(ssn);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(locationStaffId));
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** For a future audited W-2 document worker only. Never expose this through a general HTTP response. */
export function decryptSsn(payload: string, locationStaffId: string): string {
  const [version, iv, tag, encrypted] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !encrypted) throw new Error('Unsupported encrypted tax identity format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(locationStaffId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
