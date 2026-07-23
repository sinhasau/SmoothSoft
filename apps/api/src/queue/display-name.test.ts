import { describe, expect, it } from 'vitest';
import { disambiguateWaitingNames } from './display-name';

describe('disambiguateWaitingNames', () => {
  it('gives unique first names just a last initial', () => {
    const labels = disambiguateWaitingNames([
      { id: 'a', clientName: 'Jordan Lee', guestName: null },
      { id: 'b', clientName: 'Marcus Reid', guestName: null },
    ]);
    expect(labels.get('a')).toBe('Jordan L.');
    expect(labels.get('b')).toBe('Marcus R.');
  });

  it('extends the prefix for a colliding pair until they differ', () => {
    const labels = disambiguateWaitingNames([
      { id: 'a', clientName: 'Jordan Lee', guestName: null },
      { id: 'b', clientName: 'Jordan Lin', guestName: null },
    ]);
    expect(labels.get('a')).toBe('Jordan Le.');
    expect(labels.get('b')).toBe('Jordan Li.');
  });

  it('extends further for a colliding triple needing a longer prefix', () => {
    const labels = disambiguateWaitingNames([
      { id: 'a', clientName: 'Jordan Lee', guestName: null },
      { id: 'b', clientName: 'Jordan Lin', guestName: null },
      { id: 'c', clientName: 'Jordan Liu', guestName: null },
    ]);
    // Le vs Li vs Li still collide at length 1 ("L"); length 2 splits Lee out but Lin/Liu still tie; needs length 3.
    expect(labels.get('a')).toBe('Jordan Lee.');
    expect(labels.get('b')).toBe('Jordan Lin.');
    expect(labels.get('c')).toBe('Jordan Liu.');
  });

  it('passes guest labels through unchanged and leaves clients unaffected by them', () => {
    const labels = disambiguateWaitingNames([
      { id: 'a', clientName: null, guestName: 'Red Shirt' },
      { id: 'b', clientName: 'Jordan Lee', guestName: null },
    ]);
    expect(labels.get('a')).toBe('Red Shirt');
    expect(labels.get('b')).toBe('Jordan L.');
  });

  it('falls back to first name alone when there is no last name to use', () => {
    const labels = disambiguateWaitingNames([
      { id: 'a', clientName: 'Cher', guestName: null },
    ]);
    expect(labels.get('a')).toBe('Cher');
  });
});
