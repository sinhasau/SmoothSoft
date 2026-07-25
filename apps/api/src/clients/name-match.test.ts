import { describe, expect, it } from 'vitest';
import { findExactNameMatch, normalizeNameForMatch } from './name-match';

describe('normalizeNameForMatch', () => {
  it('trims, collapses internal whitespace, and case-folds', () => {
    expect(normalizeNameForMatch('  John   Smith ')).toBe('john smith');
    expect(normalizeNameForMatch('JOHN SMITH')).toBe('john smith');
  });
});

describe('findExactNameMatch', () => {
  const existing = [{ id: '1', name: 'John Smith' }, { id: '2', name: 'Casey Jones' }];

  it('matches regardless of case and spacing', () => {
    expect(findExactNameMatch(existing, 'john  smith')?.id).toBe('1');
    expect(findExactNameMatch(existing, '  Casey Jones ')?.id).toBe('2');
  });

  it('does not match a different or extended name', () => {
    expect(findExactNameMatch(existing, 'John Smith Jr')).toBeNull();
    expect(findExactNameMatch(existing, 'Jon Smith')).toBeNull();
    expect(findExactNameMatch(existing, 'Riley')).toBeNull();
  });

  it('treats an empty candidate as no match', () => {
    expect(findExactNameMatch(existing, '   ')).toBeNull();
  });
});
