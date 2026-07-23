import { describe, expect, it } from 'vitest';
import { exceedsClosingGrace } from './closing-guard';

const closeAt = new Date('2026-07-22T21:00:00Z');

describe('exceedsClosingGrace', () => {
  it('allows a finish exactly at the grace boundary', () => {
    const finish = new Date(closeAt.getTime() + 30 * 60_000);
    expect(exceedsClosingGrace(finish, closeAt, 30)).toBe(false);
  });

  it('rejects one minute past the grace boundary', () => {
    const finish = new Date(closeAt.getTime() + 31 * 60_000);
    expect(exceedsClosingGrace(finish, closeAt, 30)).toBe(true);
  });

  it('allows a finish well before closing', () => {
    const finish = new Date(closeAt.getTime() - 60 * 60_000);
    expect(exceedsClosingGrace(finish, closeAt, 30)).toBe(false);
  });
});
