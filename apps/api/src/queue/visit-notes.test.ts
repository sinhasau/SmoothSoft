import { describe, expect, it } from 'vitest';
import { initialServiceNotes, isCarriedForward } from './visit-notes';

describe('initialServiceNotes — what a new visit starts with', () => {
  it('carries the last visit forward when nothing was typed today', () => {
    expect(initialServiceNotes({ lastVisitNotes: 'Taper higher, he asked for shorter' }))
      .toBe('Taper higher, he asked for shorter');
  });

  it('prefers what was typed at check-in — someone just said it out loud', () => {
    expect(initialServiceNotes({ providedNotes: 'In a hurry today', lastVisitNotes: 'Taper higher' }))
      .toBe('In a hurry today');
  });

  it('is null for a client with no history and nothing typed', () => {
    expect(initialServiceNotes({})).toBeNull();
    expect(initialServiceNotes({ providedNotes: null, lastVisitNotes: null })).toBeNull();
  });

  it('treats whitespace-only input as nothing typed, and still carries forward', () => {
    expect(initialServiceNotes({ providedNotes: '   ', lastVisitNotes: 'Beard line kept square' }))
      .toBe('Beard line kept square');
  });

  it('treats whitespace-only history as no history', () => {
    expect(initialServiceNotes({ lastVisitNotes: '  \n ' })).toBeNull();
  });

  it('trims what it stores either way', () => {
    expect(initialServiceNotes({ providedNotes: '  running late  ' })).toBe('running late');
    expect(initialServiceNotes({ lastVisitNotes: '  #2 on the sides  ' })).toBe('#2 on the sides');
  });
});

describe('isCarriedForward — so the UI can say where the notes came from', () => {
  it('is true when last visit supplied them', () => {
    expect(isCarriedForward({ lastVisitNotes: 'Taper higher' })).toBe(true);
  });

  it('is false when they were typed today', () => {
    expect(isCarriedForward({ providedNotes: 'In a hurry', lastVisitNotes: 'Taper higher' })).toBe(false);
  });

  it('is false when there are no notes at all', () => {
    expect(isCarriedForward({})).toBe(false);
  });
});

describe('the copy is a copy, not a reference', () => {
  it('editing this visit cannot rewrite what the last barber recorded', () => {
    // The carried value is a plain string handed to the new row; there is no
    // path back to the previous entry, which is the point — a barber revising
    // today's notes must not alter the record of the last visit.
    const lastVisitNotes = 'Left sideburn slightly lower';
    const started = initialServiceNotes({ lastVisitNotes });
    expect(started).toBe(lastVisitNotes);
    expect(initialServiceNotes({ lastVisitNotes })).toBe('Left sideburn slightly lower');
  });
});
