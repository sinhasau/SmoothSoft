import { describe, expect, it } from 'vitest';
import { chooseBestMatch } from './best-match';

const candidates = [
  { staffId: 'familiar', clientVisitCount: 5 },
  { staffId: 'new', clientVisitCount: 0 },
];

describe('chooseBestMatch', () => {
  it('always honors an eligible named request', () => {
    expect(chooseBestMatch(candidates, 0, 'familiar')?.staffId).toBe('familiar');
    expect(chooseBestMatch(candidates, 0, 'familiar')?.reason).toBe('requested');
  });

  it('favors continuity at the familiar end of the slider', () => {
    expect(chooseBestMatch(candidates, 100)).toMatchObject({ staffId: 'familiar', reason: 'familiar_barber', clientVisitCount: 5 });
  });

  it('favors team variety at the variety end of the slider', () => {
    expect(chooseBestMatch(candidates, 0)).toMatchObject({ staffId: 'new', reason: 'team_variety', clientVisitCount: 0 });
  });

  it('uses stable availability order at the neutral midpoint', () => {
    expect(chooseBestMatch(candidates, 50)).toMatchObject({ staffId: 'familiar', reason: 'next_available' });
  });

  it('caps history influence so a stronger operational score still wins', () => {
    const result = chooseBestMatch([
      { staffId: 'familiar', clientVisitCount: 20, baseScore: 1 },
      { staffId: 'operationally-better', clientVisitCount: 0, baseScore: 1.2 },
    ], 100);
    expect(result?.staffId).toBe('operationally-better');
  });
});
