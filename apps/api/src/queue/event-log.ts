import { sql, type Kysely } from 'kysely';
import type { DB, QueueEventType } from '../db/kysely.types';

/**
 * Writes one row to the append-only `events` table using a per-location
 * monotonic sequence number, per ARCHITECTURE-data-and-perspectives.md 1.3:
 * `UPDATE location_sequence_counters ... RETURNING` inside the same
 * transaction the caller is already in — no race conditions, no per-tenant
 * native Postgres sequence.
 *
 * Every queue/status mutation in this module calls this FIRST, then updates
 * the queue_entries projection — the event row is the source of truth, the
 * projection is a read-optimized derivative of it.
 */
export async function appendEvent(
  trx: Kysely<DB>,
  params: {
    locationId: string;
    eventType: QueueEventType;
    entityId?: string | null;
    actorUserId?: string | null;
    payload: Record<string, unknown>;
  },
) {
  const counter = await trx
    .updateTable('location_sequence_counters')
    .set({ next_value: sql`next_value + 1` })
    .where('location_id', '=', params.locationId)
    .returning('next_value')
    .executeTakeFirst();

  if (!counter) {
    throw new Error(
      `No location_sequence_counters row for location ${params.locationId} — seed data is missing it.`,
    );
  }

  const sequenceNo = Number(counter.next_value) - 1;

  return trx
    .insertInto('events')
    .values({
      location_id: params.locationId,
      sequence_no: sequenceNo,
      event_type: params.eventType,
      entity_id: params.entityId ?? null,
      actor_user_id: params.actorUserId ?? null,
      payload: params.payload as any,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
