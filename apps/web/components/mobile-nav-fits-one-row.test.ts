import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The bottom nav must lay out for however many sections it has.
 *
 * It was `grid-template-columns: repeat(4, 1fr)`. Adding Settings to the owner
 * nav made six items, so it silently wrapped onto a second row and ate the
 * bottom of the phone screen. Nothing caught it: the horizontal-overflow check
 * passed, because wrapping is exactly how the browser avoids overflowing.
 */
describe('the mobile bottom nav', () => {
  const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');
  // There are two rules for this selector: the desktop one that hides it, and
  // the layout one inside the mobile media query. Take the layout one — the
  // first match is `display: none`, which would make every assertion below
  // pass for the wrong reason.
  const rule = css
    .split('.mobile-bottom-nav {')
    .slice(1)
    .map((chunk) => chunk.split('}')[0])
    .find((body) => body.includes('grid') || body.includes('position')) ?? '';

  it('has a bottom-nav layout rule at all, so this cannot pass vacuously', () => {
    expect(rule).toBeTruthy();
    expect(rule).not.toBe(' display: none; ');
  });

  it('does not pin the column count to a fixed number of sections', () => {
    expect(rule, 'a fixed repeat(N, …) wraps as soon as section N+1 is added').not.toMatch(/grid-template-columns:\s*repeat\(\s*\d+/);
  });

  it('flows sections into columns so any count stays on one row', () => {
    expect(rule).toMatch(/grid-auto-flow:\s*column/);
    expect(rule).toMatch(/grid-auto-columns:\s*1fr/);
  });

  it('lets an item shrink below its label width instead of forcing overflow', () => {
    const item = css.split('.mobile-bottom-nav a, .mobile-bottom-nav button {')[1]?.split('}')[0] ?? '';
    expect(item).toMatch(/min-width:\s*0/);
  });
});
