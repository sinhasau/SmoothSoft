import type { StaffRole } from '../db/kysely.types';

/**
 * DEV-ONLY auth. Stands in for the real role/permission system described in
 * docs/ARCHITECTURE-data-and-perspectives.md Part 2 (resolved-permissions
 * function merging role defaults with location_staff.permission_overrides).
 * There is no password check here — /auth/login accepts a location_staff_id
 * from the seeded roster and issues a signed cookie. Do not ship this auth
 * flow past local development.
 */
export interface AuthClaims {
  userId: string;
  locationStaffId: string;
  organizationId: string;
  locationId: string;
  role: StaffRole;
  fullName: string;
}
