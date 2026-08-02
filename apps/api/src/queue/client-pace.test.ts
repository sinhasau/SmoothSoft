import { describe, expect, it } from 'vitest';
import { clampFactor, clientPaceFactors, MAX_FACTOR, MIN_FACTOR, paceMultiplier, type ClientVisitTiming } from './client-pace';

const visit = (clientId: string, actualMinutes: number, expectedMinutes = 20, catalogMinutes: number | null = 20): ClientVisitTiming => ({
  clientId,
  actualMinutes,
  expectedMinutes,
  catalogMinutes,
});

describe('clientPaceFactors', () => {
  it('reports a client who consistently runs long as a factor above 1', () => {
    const paces = clientPaceFactors([visit('c1', 26), visit('c1', 24), visit('c1', 30)]);
    expect(paces.get('c1')!.factor).toBeCloseTo(1.3);
    expect(paces.get('c1')!.sampleCount).toBe(3);
  });

  it('reports a quick client as a factor below 1', () => {
    const paces = clientPaceFactors([visit('c1', 16), visit('c1', 14), visit('c1', 16)]);
    expect(paces.get('c1')!.factor).toBeCloseTo(0.8);
  });

  it('reports a typical client as about 1', () => {
    const paces = clientPaceFactors([visit('c1', 20), visit('c1', 21), visit('c1', 19)]);
    expect(paces.get('c1')!.factor).toBeCloseTo(1.0);
  });

  it('pools visits across different services by comparing each to its own expectation', () => {
    // A 45-minute colour and a 20-minute haircut, both run 1.5x long.
    const paces = clientPaceFactors([
      visit('c1', 30, 20, 20),
      visit('c1', 67.5, 45, 45),
      visit('c1', 30, 20, 20),
    ]);
    expect(paces.get('c1')!.factor).toBeCloseTo(1.5);
  });

  it('uses the median, so one bad visit does not define a client', () => {
    // Four normal visits and one 90-minute outlier (still inside the 5x bound).
    const paces = clientPaceFactors([visit('c1', 20), visit('c1', 20), visit('c1', 90), visit('c1', 21), visit('c1', 19)]);
    expect(paces.get('c1')!.factor).toBeCloseTo(1.0);
  });

  it('discards a visit past the plausibility bound entirely', () => {
    // 200 minutes against a 20-minute catalog service is 10x — a forgotten Complete.
    const paces = clientPaceFactors([visit('c1', 200), visit('c1', 20), visit('c1', 20)]);
    expect(paces.get('c1')!.sampleCount).toBe(2);
    expect(paces.get('c1')!.factor).toBeCloseTo(1.0);
  });

  it('ignores a visit with no usable expectation to divide by', () => {
    expect(clientPaceFactors([visit('c1', 20, 0)]).has('c1')).toBe(false);
  });

  it('keeps only the most recent visits within the sample limit', () => {
    const recent = Array.from({ length: 12 }, () => visit('c1', 30));
    const paces = clientPaceFactors(recent, 10);
    expect(paces.get('c1')!.sampleCount).toBe(10);
  });

  it('tracks each client separately', () => {
    const paces = clientPaceFactors([visit('slow', 30), visit('slow', 30), visit('slow', 30), visit('quick', 12), visit('quick', 12), visit('quick', 12)]);
    expect(paces.get('slow')!.factor).toBeCloseTo(1.5);
    expect(paces.get('quick')!.factor).toBeCloseTo(0.6);
  });

  it('reports a median actual duration for the profile', () => {
    const paces = clientPaceFactors([visit('c1', 22), visit('c1', 26), visit('c1', 24)]);
    expect(paces.get('c1')!.medianMinutes).toBe(24);
  });
});

describe('clampFactor — one client cannot dominate the board', () => {
  it('caps an extreme slow reading', () => {
    expect(clampFactor(4)).toBe(MAX_FACTOR);
  });

  it('floors an extreme fast reading', () => {
    expect(clampFactor(0.1)).toBe(MIN_FACTOR);
  });

  it('leaves an ordinary factor untouched', () => {
    expect(clampFactor(1.25)).toBeCloseTo(1.25);
  });

  it('is applied when building the pace, not only at use time', () => {
    const paces = clientPaceFactors([visit('c1', 90, 20, 100), visit('c1', 90, 20, 100), visit('c1', 90, 20, 100)]);
    expect(paces.get('c1')!.factor).toBe(MAX_FACTOR);
  });
});

describe('paceMultiplier — a new client is predicted from the service alone', () => {
  it('is neutral for an unknown client', () => {
    expect(paceMultiplier(undefined)).toBe(1);
  });

  it('is neutral below the minimum visit count, however extreme the ratio', () => {
    const paces = clientPaceFactors([visit('c1', 40), visit('c1', 40)]);
    expect(paces.get('c1')!.sampleCount).toBe(2);
    expect(paceMultiplier(paces.get('c1'))).toBe(1);
  });

  it('applies once the client has enough history', () => {
    const paces = clientPaceFactors([visit('c1', 26), visit('c1', 26), visit('c1', 26)]);
    expect(paceMultiplier(paces.get('c1'))).toBeCloseTo(1.3);
  });
});

describe('the ratio must be taken against the barber-aware expectation', () => {
  // A client who is perfectly ordinary but only ever sees a barber who runs
  // 26 minutes on a 20-minute cut. Both call sites (the queue board and the
  // client profile) must divide by that barber's median, not the catalog
  // duration, or the barber's pace gets counted as the client's.
  const actual = 26;
  const barberMedian = 26;
  const catalogMinutes = 20;

  it('reads an average client as average when divided by the barber median', () => {
    const paces = clientPaceFactors(Array.from({ length: 3 }, () => ({
      clientId: 'c1', actualMinutes: actual, expectedMinutes: barberMedian, catalogMinutes,
    })));
    expect(paces.get('c1')!.factor).toBeCloseTo(1.0);
    // Prediction stays at the barber's own pace — no double count.
    expect(barberMedian * paceMultiplier(paces.get('c1'))).toBeCloseTo(26);
  });

  it('demonstrates the double count when divided by the catalog duration instead', () => {
    const paces = clientPaceFactors(Array.from({ length: 3 }, () => ({
      clientId: 'c1', actualMinutes: actual, expectedMinutes: catalogMinutes, catalogMinutes,
    })));
    expect(paces.get('c1')!.factor).toBeCloseTo(1.3);
    // The barber's 26-minute median then gets inflated by the barber's own
    // slowness a second time — the bug this guards against.
    expect(barberMedian * paceMultiplier(paces.get('c1'))).toBeCloseTo(33.8);
  });

  it('still isolates a genuinely slow client seeing that same slow barber', () => {
    const paces = clientPaceFactors(Array.from({ length: 3 }, () => ({
      clientId: 'c1', actualMinutes: 39, expectedMinutes: barberMedian, catalogMinutes,
    })));
    expect(paces.get('c1')!.factor).toBeCloseTo(1.5);
  });
});
