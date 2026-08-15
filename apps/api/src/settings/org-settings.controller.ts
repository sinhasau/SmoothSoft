import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireManager, requireOwner } from '../common/request-context';
import { canSeeStaffContact } from '../common/staff-contact-visibility';
import { db } from '../common/request-context';
import { contactUpdateFor, type ContactPatch } from './org-settings.service';
import { BadRequestException, ForbiddenException, Inject, NotFoundException, Param } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import { runInLocationScope } from '../db/scoped-query';
import { OrgSettingsService, type ApplyScope } from './org-settings.service';

/**
 * Organization-wide operating policy.
 *
 * Owner-only: these defaults reach across every shop, which is precisely what
 * a location manager is not allowed to do (see ARCHITECTURE §Part 2 — a
 * manager is scoped to the locations they manage).
 */
@Controller('org/settings')
@UseGuards(AuthGuard)
export class OrgSettingsController {
  constructor(private readonly settings: OrgSettingsService) {}

  @Get()
  get() {
    const auth = requireOwner();
    return this.settings.get(auth.organizationId);
  }

  /**
   * One field per request. See the service for why a whole-row save is the
   * wrong shape here.
   */
  @Put()
  update(@Body() body: { key?: string; value?: unknown; scope?: ApplyScope }) {
    const auth = requireOwner();
    return this.settings.update(auth.organizationId, String(body?.key ?? ''), body?.value, body?.scope ?? 'future');
  }
}

/**
 * Writing a staff member's contact details.
 *
 * Separate controller because the route is about a PERSON, not about
 * organization settings, and because the write rule differs from the read rule
 * in one way worth being explicit about: reading is governed by
 * `canSeeStaffContact`, and writing uses the same predicate — you may edit
 * exactly what you may see. Anything looser would let a manager read one shop's
 * staff and write another's.
 */
@Controller('staff-contact')
@UseGuards(AuthGuard)
export class StaffContactController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Put(':userId')
  async update(@Param('userId') userId: string, @Body() patch: ContactPatch) {
    // requireManager, not requireAuth: a barber editing their OWN address is a
    // reasonable feature but needs its own self-service route with its own
    // rules, not a management endpoint that happens to allow it.
    const auth = requireManager();

    // Every location this person is assigned to, across the organization.
    //
    // A plain `select from location_staff where user_id = ?` does NOT work here:
    // location_staff is RLS-scoped to the request's active location, so it
    // returns only the assignment at the shop the viewer happens to be in. An
    // owner editing a barber who works solely at another shop got a 404 —
    // verified against a real database before this was rewritten.
    //
    // Same one-scoped-transaction-per-location pattern as the owner dashboard:
    // nothing widens a policy, the aggregation happens in application code.
    const locations = await db()
      .selectFrom('locations')
      .select(['id'])
      .where('organization_id', '=', auth.organizationId)
      .execute();

    const locationIds: string[] = [];
    for (const location of locations) {
      const assigned = await runInLocationScope(this.pool, auth.organizationId, location.id, async (scoped) =>
        scoped
          .selectFrom('location_staff')
          .select(['location_id'])
          .where('user_id', '=', userId)
          .where('location_id', '=', location.id)
          .executeTakeFirst(),
      );
      if (assigned) locationIds.push(location.id);
    }
    if (locationIds.length === 0) throw new NotFoundException('No such staff member at this organization.');

    const allowed = canSeeStaffContact(
      { userId: auth.userId, role: auth.role, organizationId: auth.organizationId, locationId: auth.locationId },
      { userId, organizationId: auth.organizationId, locationIds },
    );
    if (!allowed) throw new ForbiddenException('You cannot edit this person’s contact details.');

    const update = contactUpdateFor(patch);
    if (Object.keys(update).length === 0) throw new BadRequestException('No contact fields to update.');

    await db().updateTable('users').set(update as never).where('id', '=', userId).execute();
    return { userId, updated: Object.keys(update) };
  }
}

/**
 * A shop's public address and phone.
 *
 * Owner-only: adding and configuring locations is explicitly outside a
 * manager's scope (ARCHITECTURE Part 2 — a manager "cannot touch org-level
 * billing or add/remove locations"). Unlike a staff home address this is not
 * restricted for READING — it belongs on receipts and booking pages — only for
 * writing.
 */
@Controller('org/locations')
@UseGuards(AuthGuard)
export class OrgLocationsController {
  @Put(':locationId/address')
  async updateAddress(
    @Param('locationId') locationId: string,
    @Body() patch: { addressLine1?: string | null; addressLine2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; country?: string | null; phone?: string | null },
  ) {
    const auth = requireOwner();

    // Scoped by organization_id, so an owner cannot reach another tenant's shop
    // by guessing an id — and the 404 does not reveal whether it exists.
    const location = await db()
      .selectFrom('locations')
      .select(['id'])
      .where('id', '=', locationId)
      .where('organization_id', '=', auth.organizationId)
      .executeTakeFirst();
    if (!location) throw new NotFoundException('No such location in this organization.');

    const columns: Record<string, string> = {
      addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city',
      region: 'region', postalCode: 'postal_code', country: 'country', phone: 'phone',
    };
    const update: Record<string, string | null> = {};
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in patch)) continue;
      const raw = (patch as Record<string, string | null | undefined>)[key];
      const value = typeof raw === 'string' ? raw.trim() : raw ?? null;
      // Blank clears the field rather than storing an empty string, which would
      // print as a stray line on a receipt.
      update[column] = value === '' ? null : (value ?? null);
    }
    if (Object.keys(update).length === 0) throw new BadRequestException('No address fields to update.');

    await db().updateTable('locations').set(update as never).where('id', '=', locationId).execute();
    return { locationId, updated: Object.keys(update) };
  }
}
