import { isPlausibleDuration, medianOf } from './service-performance';

/**
 * How much longer or shorter a given client's visits run than the service
 * itself would suggest.
 *
 * Stored as a *ratio*, not an absolute median, because a client is a small
 * sample spread across different services and barbers: someone with three
 * visits might have had a haircut, a beard trim, and a colour, from two
 * different barbers. An absolute per-client-per-service median would almost
 * never reach a usable sample count, whereas "this person runs about 1.3x the
 * expected time" pools all of their visits into one number that transfers to a
 * service they have never had before.
 *
 * The ratio is taken against the expected duration used at the time (the
 * barber's own median where known, else the catalog duration), so it captures
 * what is specific to the *client* — thick hair, a talkative chair, a child who
 * will not sit still — rather than re-counting how fast the barber is.
 */
export interface ClientVisitTiming {
  clientId: string;
  actualMinutes: number;
  /** What the algorithm would have predicted for this visit, ignoring the client. */
  expectedMinutes: number;
  /** Catalog duration for the service, for the plausibility bound. */
  catalogMinutes?: number | null;
}

export interface ClientPace {
  clientId: string;
  /** Median of actual/expected across this client's recent visits. */
  factor: number;
  sampleCount: number;
  /** Median actual minutes — what to show on the profile. */
  medianMinutes: number;
}

/** Below this many visits, a client's pace is noise and the factor is not applied. */
export const MIN_CLIENT_VISITS = 3;

/**
 * A single client can nudge an estimate, not dominate it. Even a genuinely slow
 * regular is bounded, because the queue behind them pays for an overestimate
 * just as surely as for an underestimate — and the live overrun adjustment
 * (overrun.ts) already handles a visit that turns out longer than predicted.
 */
export const MIN_FACTOR = 0.6;
export const MAX_FACTOR = 1.6;

export function clampFactor(factor: number): number {
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
}

/** Visits must be newest-first; keeps the most recent `sampleLimit` per client. */
export function clientPaceFactors(visits: ClientVisitTiming[], sampleLimit = 10): Map<string, ClientPace> {
  const ratios = new Map<string, number[]>();
  const minutes = new Map<string, number[]>();

  for (const visit of visits) {
    if (!isPlausibleDuration(visit.actualMinutes, visit.catalogMinutes)) continue;
    if (!Number.isFinite(visit.expectedMinutes) || visit.expectedMinutes <= 0) continue;
    const seen = ratios.get(visit.clientId) ?? [];
    if (seen.length >= sampleLimit) continue;
    seen.push(visit.actualMinutes / visit.expectedMinutes);
    ratios.set(visit.clientId, seen);
    minutes.set(visit.clientId, [...(minutes.get(visit.clientId) ?? []), visit.actualMinutes]);
  }

  const paces = new Map<string, ClientPace>();
  for (const [clientId, values] of ratios) {
    paces.set(clientId, {
      clientId,
      factor: clampFactor(medianOf(values)),
      sampleCount: values.length,
      medianMinutes: Math.round(medianOf(minutes.get(clientId) ?? []) * 10) / 10,
    });
  }
  return paces;
}

/**
 * The client adjustment actually applied to a prediction. Returns 1 (no
 * adjustment) until the client has enough visits to say anything, so a new
 * client is predicted purely from the service and the barber.
 */
export function paceMultiplier(pace: ClientPace | undefined): number {
  if (!pace || pace.sampleCount < MIN_CLIENT_VISITS) return 1;
  return pace.factor;
}
