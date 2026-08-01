import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../common/phone';
import { findExactNameMatch } from '../clients/name-match';

/**
 * The intake rules that keep the client directory identifiable. These mirror
 * the guards in QueueService.checkIn / createClient; the guards themselves are
 * a few lines of branching over a live transaction, so what is worth pinning
 * is the decision each one encodes.
 */

/** A profile is only savable when the number actually contains digits. */
function canSaveAsClient(phone: string | undefined): boolean {
  return !!normalizePhone(phone ?? '');
}

describe('a contact needs a way to be reached', () => {
  it('rejects an entirely missing number', () => {
    expect(canSaveAsClient(undefined)).toBe(false);
    expect(canSaveAsClient('')).toBe(false);
  });

  it('rejects punctuation that contains no digits — an empty form, not a number', () => {
    expect(canSaveAsClient('---')).toBe(false);
    expect(canSaveAsClient('()  -')).toBe(false);
    expect(canSaveAsClient('n/a')).toBe(false);
  });

  it('accepts a real number in any formatting', () => {
    expect(canSaveAsClient('(313) 555-0142')).toBe(true);
    expect(canSaveAsClient('3135550142')).toBe(true);
  });

  it('is the same normalization the stored phone_normalized uses, so the check and the write agree', () => {
    expect(normalizePhone('(313) 555-0142')).toBe('3135550142');
  });
});

describe('two people named Mike Smith', () => {
  const onThisNumber = [{ id: 'c1', name: 'Mike Smith' }];

  it('blocks a second identical name on the same number — that is one person, twice', () => {
    expect(findExactNameMatch(onThisNumber, 'Mike Smith')?.id).toBe('c1');
    expect(findExactNameMatch(onThisNumber, 'mike  smith')?.id).toBe('c1');
  });

  it('still allows a genuinely different household member on that number', () => {
    expect(findExactNameMatch(onThisNumber, 'Sara Smith')).toBeNull();
    expect(findExactNameMatch(onThisNumber, 'Mike Smith Jr')).toBeNull();
  });

  it('does not conflate two Mike Smiths who are on different numbers', () => {
    // The duplicate check only ever looks at profiles sharing the phone, so an
    // unrelated Mike Smith elsewhere in the org is untouched by it.
    expect(findExactNameMatch([], 'Mike Smith')).toBeNull();
  });

  it('leaves same-named guests alone — no number means no profile to collide with', () => {
    // Guests never reach the client table, so two walk-in "Mike Smith"s are
    // simply two queue entries, disambiguated on the Floor by identity_note.
    expect(canSaveAsClient(undefined)).toBe(false);
  });
});
