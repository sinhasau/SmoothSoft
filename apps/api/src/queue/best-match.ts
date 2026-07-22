export interface MatchCandidate {
  staffId: string;
  /** Stronger operational signals can be added here without letting history dominate. */
  baseScore?: number;
  clientVisitCount: number;
}

export type MatchReason = 'requested' | 'familiar_barber' | 'team_variety' | 'next_available';

export interface BestMatch {
  staffId: string;
  reason: MatchReason;
  clientVisitCount: number;
  score: number;
}

/**
 * History is intentionally capped at 15% of the score. Availability and an
 * explicit named-barber request are resolved before this function; this is a
 * low-weight tie-breaker among otherwise eligible professionals.
 */
export function chooseBestMatch(candidates: MatchCandidate[], continuityWeight: number, requestedStaffId?: string | null): BestMatch | null {
  if (!candidates.length) return null;

  const requested = requestedStaffId ? candidates.find((candidate) => candidate.staffId === requestedStaffId) : undefined;
  if (requested) return { staffId: requested.staffId, reason: 'requested', clientVisitCount: requested.clientVisitCount, score: Number.POSITIVE_INFINITY };

  const clampedWeight = Math.max(0, Math.min(100, continuityWeight));
  const direction = (clampedWeight - 50) / 50;
  const maxVisits = Math.max(1, ...candidates.map((candidate) => candidate.clientVisitCount));
  const ranked = candidates.map((candidate, index) => ({
    ...candidate,
    index,
    score: (candidate.baseScore ?? 1) + direction * (candidate.clientVisitCount / maxVisits) * 0.15,
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked[0];
  const hasHistory = maxVisits > 0 && candidates.some((candidate) => candidate.clientVisitCount > 0);
  const reason: MatchReason = !hasHistory || clampedWeight === 50
    ? 'next_available'
    : clampedWeight > 50 && selected.clientVisitCount > 0
      ? 'familiar_barber'
      : clampedWeight < 50
        ? 'team_variety'
        : 'next_available';

  return { staffId: selected.staffId, reason, clientVisitCount: selected.clientVisitCount, score: selected.score };
}
