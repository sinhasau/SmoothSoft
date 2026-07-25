import { ConflictException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../db/kysely.types';
import { normalizePhone } from '../common/phone';
import { findExactNameMatch } from './name-match';

/**
 * The fix for the gap flagged in PRD-live-queue-checkin.md §5.4: "today, an
 * unrecognized phone number just becomes the display string for that queue
 * entry — no actual client record gets created." This is the moment a real
 * client profile gets created, not an afterthought bolted onto reporting
 * later.
 *
 * Also implements the staleness guard from
 * ARCHITECTURE-data-and-perspectives.md Part 3: a phone match older than
 * the staleness threshold gets surfaced to the caller as `stale` so the
 * check-in UI can soft-prompt staff ("same person, or start a new
 * profile?") instead of silently loading someone else's history onto
 * whoever now holds that number. Default threshold: 6 months, per that
 * doc's "starting point" recommendation — not yet an org-level Settings
 * field (flagged as a fast-follow, not built in this pass).
 */
const STALENESS_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 30 * 6; // ~6 months

export interface ClientLookupResult {
  clientId: string | null;
  isNewClient: boolean;
  isStale: boolean;
  staleLastConfirmedAt: Date | null;
}

export async function findClientByPhone(
  trx: Kysely<DB>,
  organizationId: string,
  phoneRaw: string,
): Promise<ClientLookupResult> {
  const phoneNormalized = normalizePhone(phoneRaw);
  if (!phoneNormalized) {
    return { clientId: null, isNewClient: false, isStale: false, staleLastConfirmedAt: null };
  }

  const existing = await trx
    .selectFrom('clients')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('phone_normalized', '=', phoneNormalized)
    .executeTakeFirst();

  if (!existing) {
    return { clientId: null, isNewClient: true, isStale: false, staleLastConfirmedAt: null };
  }

  const lastConfirmed = existing.last_confirmed_at ? new Date(existing.last_confirmed_at) : null;
  const isStale = !lastConfirmed || Date.now() - lastConfirmed.getTime() > STALENESS_THRESHOLD_MS;

  return {
    clientId: existing.id,
    isNewClient: false,
    isStale,
    staleLastConfirmedAt: lastConfirmed,
  };
}

/**
 * All clients sharing this phone number — a household sharing one line is
 * expected, not an edge case (see the phone-reassignment comment on
 * `phone_bindings` above; `clients.phone_normalized` deliberately has no
 * unique constraint). Used by the public queue-join flow's "who's checking
 * in" step so every profile on file for a number can be offered, not just
 * whichever one a single-result lookup happens to return first.
 */
export async function findClientsByPhone(
  trx: Kysely<DB>,
  organizationId: string,
  phoneRaw: string,
): Promise<{ id: string; name: string }[]> {
  const phoneNormalized = normalizePhone(phoneRaw);
  if (!phoneNormalized) return [];
  return trx
    .selectFrom('clients')
    .select(['id', 'name'])
    .where('organization_id', '=', organizationId)
    .where('phone_normalized', '=', phoneNormalized)
    .orderBy('name')
    .execute();
}

export interface NewClientInput {
  organizationId: string;
  name: string;
  phone: string;
  referralSource?: string | null;
  allergyFlag?: boolean;
}

export async function createClient(trx: Kysely<DB>, input: NewClientInput) {
  const phoneNormalized = normalizePhone(input.phone);

  // A household can share one number with different names, but an EXACT same-name profile on the
  // same number is a true duplicate — block it here so no creation path (public multi-person add,
  // walk-in intake, booking, rebook) can produce two identical profiles. The caller gets the
  // existing profile's id so the UI can offer "use that profile" instead of forcing a new name.
  if (phoneNormalized && input.name?.trim()) {
    const sameNumber = await trx
      .selectFrom('clients')
      .select(['id', 'name'])
      .where('organization_id', '=', input.organizationId)
      .where('phone_normalized', '=', phoneNormalized)
      .execute();
    const duplicate = findExactNameMatch(sameNumber, input.name);
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME_ON_PHONE',
        message: `A profile named "${duplicate.name}" already exists on this number. Use that profile, or enter a different name.`,
        existingClientId: duplicate.id,
      });
    }
  }

  const client = await trx
    .insertInto('clients')
    .values({
      organization_id: input.organizationId,
      name: input.name,
      phone_normalized: phoneNormalized || null,
      phone_display: input.phone || null,
      referral_source: input.referralSource ?? null,
      allergy_flag: input.allergyFlag ?? false,
      last_confirmed_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (phoneNormalized) {
    // A number may already have an active binding — a household adding a new
    // person to a shared line (the public multi-person picker's whole point),
    // or a number being reassigned to someone new. Only one active binding per
    // number is allowed (idx_phone_bindings_active), so supersede whoever
    // currently holds it before this new client takes it over. Mirrors the
    // rebook path in clients.service.ts.
    await trx
      .updateTable('phone_bindings')
      .set({ superseded_at: new Date() })
      .where('phone_normalized', '=', phoneNormalized)
      .where('superseded_at', 'is', null)
      .execute();
    await trx
      .insertInto('phone_bindings')
      .values({ phone_normalized: phoneNormalized, client_id: client.id })
      .execute();
  }

  return client;
}

/** Call whenever a check-in / checkout genuinely re-confirms who a client is — resets the staleness clock. */
export async function touchClientConfirmed(trx: Kysely<DB>, clientId: string) {
  await trx.updateTable('clients').set({ last_confirmed_at: new Date() }).where('id', '=', clientId).execute();
}
