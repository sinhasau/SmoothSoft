import { describe, expect, it } from 'vitest';
import { disambiguateProfiles, maskPhone, minimalUniqueReveal } from './profile-disambiguation';

const p = (clientId: string, name: string, phoneDigits: string | null) => ({ clientId, name, phoneDigits, suggestedServiceIds: [] });

describe('maskPhone', () => {
  it('reveals the last N digits and masks the rest', () => {
    expect(maskPhone('3135551234', 4)).toBe('••••••1234');
    expect(maskPhone('3135551234', 5)).toBe('•••••51234');
  });
});

describe('minimalUniqueReveal', () => {
  it('uses 4 when the last four already distinguish', () => {
    expect(minimalUniqueReveal(['3135551234', '3135555678'])).toBe(4);
  });
  it('escalates until the suffixes are unique', () => {
    // both end 1234; differ at the 5th-from-last digit
    expect(minimalUniqueReveal(['5551231234', '5559991234'])).toBe(5);
  });
});

describe('disambiguateProfiles', () => {
  it('shows no masked phone when the name is unique', () => {
    const out = disambiguateProfiles([p('1', 'Casey Jones', '3135550000'), p('2', 'Riley Poe', '3135551111')]);
    expect(out.every((o) => o.maskedPhone === null)).toBe(true);
  });

  it('masks to last four for same-name people with different endings', () => {
    const out = disambiguateProfiles([p('1', 'John Smith', '3135551234'), p('2', 'John Smith', '3135555678')]);
    expect(out.find((o) => o.clientId === '1')?.maskedPhone).toBe('••••••1234');
    expect(out.find((o) => o.clientId === '2')?.maskedPhone).toBe('••••••5678');
  });

  it('reveals an extra digit when same-name people share the last four', () => {
    const out = disambiguateProfiles([p('1', 'John Smith', '5551231234'), p('2', 'John Smith', '5559991234')]);
    expect(out.find((o) => o.clientId === '1')?.maskedPhone).toBe('•••••31234');
    expect(out.find((o) => o.clientId === '2')?.maskedPhone).toBe('•••••91234');
  });

  it('only masks within the colliding name group, leaving unique names clean', () => {
    const out = disambiguateProfiles([
      p('1', 'John Smith', '3135551234'),
      p('2', 'John Smith', '3135555678'),
      p('3', 'Dana Lee', '3135559999'),
    ]);
    expect(out.find((o) => o.clientId === '3')?.maskedPhone).toBeNull();
    expect(out.find((o) => o.clientId === '1')?.maskedPhone).toBe('••••••1234');
  });

  it('returns null masked phone for a same-name profile with no number on file', () => {
    const out = disambiguateProfiles([p('1', 'John Smith', '3135551234'), p('2', 'John Smith', null)]);
    expect(out.find((o) => o.clientId === '2')?.maskedPhone).toBeNull();
  });
});
