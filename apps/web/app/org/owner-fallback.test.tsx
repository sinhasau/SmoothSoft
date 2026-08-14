import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OwnerFallback } from './owner-fallback';
import { ShopLink } from './shop-link';

const loading = { isError: false, error: null, refetch: vi.fn(), isFetching: true };
const failed = { isError: true, error: new Error('column ls.classification does not exist'), refetch: vi.fn(), isFetching: false };

describe('OwnerFallback', () => {
  it('says it is loading when the request is still in flight', () => {
    render(<OwnerFallback query={loading} what="the team" />);
    expect(screen.getByText(/loading the team/i)).toBeInTheDocument();
  });

  it('says the load FAILED when the request failed — never "loading"', () => {
    // The regression this exists for: five owner pages destructured only
    // `data`, so a 500 rendered "Loading team…" forever.
    render(<OwnerFallback query={failed} what="the team" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/could not load the team/i)).toBeInTheDocument();
    expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument();
  });

  it('shows the underlying error and offers a retry', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    render(<OwnerFallback query={{ ...failed, refetch }} what="the team" />);
    expect(screen.getByText(/column ls.classification does not exist/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

describe('ShopLink', () => {
  it('links into the shop when there is one', () => {
    render(<ShopLink locationId="loc-1" suffix="/staff" className="x" emptyReason="no locations yet">Add or manage staff</ShopLink>);
    expect(screen.getByRole('link', { name: /add or manage staff/i })).toHaveAttribute('href', '/locations/loc-1/staff');
  });

  it('never renders an /undefined href when the org has no locations', () => {
    // A brand-new organization rendered `/locations/undefined/staff` — a
    // live-looking button to a broken route, and the first thing a new owner
    // would click.
    const { container } = render(<ShopLink locationId={undefined} suffix="/staff" className="x" emptyReason="no locations yet">Add or manage staff</ShopLink>);
    expect(container.querySelector('a')).toBeNull();
    for (const a of container.querySelectorAll('[href]')) {
      expect(a.getAttribute('href')).not.toMatch(/undefined/);
    }
  });

  it('stays visible and states why, rather than disappearing', () => {
    // A control that vanishes when it does not apply cannot be found by
    // someone looking for it; `title` is invisible on touch devices.
    render(<ShopLink locationId={undefined} suffix="/staff" className="x" emptyReason="no locations yet">Add or manage staff</ShopLink>);
    expect(screen.getByText(/add or manage staff/i)).toBeInTheDocument();
    expect(screen.getByText(/no locations yet/i)).toBeInTheDocument();
    expect(screen.getByText(/add or manage staff/i).closest('[aria-disabled="true"]')).not.toBeNull();
  });
});

describe('every owner page routes its no-data path through OwnerFallback', () => {
  // A source scan, in the spirit of modal-is-the-only-overlay.test.ts. The bug
  // was not one page getting it wrong — it was the same decision being made
  // independently six times and five of them landing on "Loading…". Nothing
  // stops the seventh page from repeating it except this test.
  const ORG = join(__dirname);

  function pagesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return pagesUnder(full);
      return entry.name === 'page.tsx' ? [full] : [];
    });
  }

  const pages = pagesUnder(ORG);

  it('finds the owner pages at all, so this cannot pass vacuously', () => {
    expect(pages.length).toBeGreaterThanOrEqual(6);
  });

  it.each(pages.map((p) => [p.slice(ORG.length) || '/page.tsx', p]))('%s', (_label, file) => {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('useOwnerDashboard')) return;

    expect(source, 'must render OwnerFallback when it has no data').toContain('OwnerFallback');

    // The exact shape of the original bug: a bare loading string returned for
    // the missing-data case, which swallows isError.
    const bareLoadingReturn = /if\s*\(!\s*data\s*\)\s*return\s*<p[^>]*>[^<]*[Ll]oading/;
    expect(bareLoadingReturn.test(source), 'returns a bare "Loading…" paragraph instead of OwnerFallback').toBe(false);
  });
});

describe('the owner dashboard type tolerates an older API', () => {
  it('keeps `organization` optional', () => {
    // Web and API deploy independently, so a newer web build routinely runs
    // against an older API. Making this required again would let
    // `data.organization.name` typecheck and blank the whole workspace.
    const types = readFileSync(join(__dirname, 'org-types.ts'), 'utf8');
    expect(types).toMatch(/organization\?:/);
  });

  it('has no unguarded data.organization.name access left in the workspace', () => {
    for (const file of [join(__dirname, 'layout.tsx'), join(__dirname, 'page.tsx'), join(__dirname, 'reports', 'all', 'page.tsx')]) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} dereferences organization without a guard`).not.toMatch(/(?<!\?)\.organization\.name/);
    }
  });
});
