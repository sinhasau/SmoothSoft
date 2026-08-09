/**
 * CLAUDE.md: "One shared Modal in apps/web/components/modal.tsx. Do not
 * hand-roll another — a duplicated copy is how the same 'can't scroll to the
 * submit button on mobile' bug shipped twice."
 *
 * It shipped three times. After the first consolidation, three overlays were
 * still hand-rolled, and each had quietly dropped a different fix:
 *
 *   checkout shell            no backdrop scroll, no overscroll-contain,
 *                             no safe-area padding
 *   sale receipt / refund     no safe-area padding, so the actions sat under
 *                             the iPhone home indicator
 *   staff onboarding form     no max-height and no panel scroll at all
 *
 * A rule nothing enforces is a rule that decays, so this enforces it. The
 * check is deliberately crude — `fixed inset-0` is the giveaway for a
 * full-screen overlay — because a crude check that runs beats a precise one
 * that needs a browser.
 *
 * If a genuinely non-modal full-screen element is needed one day (a drag
 * layer, a confetti canvas), add it to ALLOWED with a note saying why it is
 * not a dialog. Do not add a dialog to that list.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const SEARCH_DIRS = ['app', 'components'];

/** Files permitted to position a full-screen fixed layer. */
const ALLOWED = new Set(['components/modal.tsx']);

/**
 * Strips comments so prose about the bug does not read as the bug — the header
 * of modal.tsx documents the original `max-h-[86vh]` mistake by name, and that
 * explanation is worth keeping.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const files = SEARCH_DIRS.flatMap((dir) => walk(join(WEB_ROOT, dir)));

describe('the shared Modal is the only overlay', () => {
  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no hand-rolled full-screen overlay outside components/modal.tsx', () => {
    const offenders = files
      .filter((file) => /fixed\s+inset-0/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(WEB_ROOT.length + 1).split('\\').join('/'))
      .filter((relative) => !ALLOWED.has(relative));

    expect(
      offenders,
      offenders.length
        ? `Hand-rolled overlay(s) found — use <Modal> from components/modal.tsx instead:\n${offenders
            .map((f) => `  • ${f}`)
            .join('\n')}`
        : '',
    ).toEqual([]);
  });
});

describe('no viewport-height units that ignore mobile browser chrome', () => {
  // vh is measured with the URL bar hidden, so a vh-sized element hangs off
  // the bottom of the screen the whole time that bar is showing. dvh is the
  // one that tracks the visible viewport. `min-h-screen` is Tailwind's alias
  // for 100vh and has the same problem — it was still on the public booking
  // and feedback pages, which are the two a customer actually touches.
  it('uses dvh, never vh or min-h-screen', () => {
    const offenders = files
      .map((file) => ({
        file: file.slice(WEB_ROOT.length + 1).split('\\').join('/'),
        source: stripComments(readFileSync(file, 'utf8')),
      }))
      .filter(({ source }) => /\d+vh\b/.test(source) || /\bmin-h-screen\b/.test(source))
      .map(({ file }) => file);

    expect(
      offenders,
      offenders.length
        ? `Use dvh (e.g. min-h-[100dvh]) instead of vh / min-h-screen in:\n${offenders
            .map((f) => `  • ${f}`)
            .join('\n')}`
        : '',
    ).toEqual([]);
  });
});
