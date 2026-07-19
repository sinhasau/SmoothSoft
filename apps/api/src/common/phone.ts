/**
 * Normalized on write, not computed at query time — see
 * ARCHITECTURE-data-and-perspectives.md 1.2/1.6 and clients.phone_normalized
 * in 0003_clients_identity.sql. Every write path (check-in, client profile
 * edit) must call this before storing a phone number.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}
