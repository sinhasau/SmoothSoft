import type { Kysely } from 'kysely';
import type { DB } from '../db/kysely.types';
import { normalizePhone } from '../common/phone';

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
