import { describe, expect, it } from 'vitest';
import { buildNavSections } from './nav-sections';

const BASE = '/locations/loc1';
const labels = (items: { label: string }[]) => items.map((item) => item.label);

describe('buildNavSections — org_owner (the reported bug)', () => {
  const nav = buildNavSections('org_owner', BASE, true);

  it('gives the owner the full Manage section', () => {
    expect(labels(nav.management)).toEqual(['Overview', 'Team', 'Sales', 'Reports', 'Messages', 'Settings']);
  });

  it('gives the owner the Customer section', () => {
    expect(labels(nav.customer)).toEqual(['Complaints']);
  });

  it('exposes every Manage and Customer item through the mobile More sheet', () => {
    // The bug: these existed only in the desktop sidebar, so an owner on a
    // phone could not reach Team/Sales/Reports/Settings/Complaints at all.
    expect(labels(nav.more)).toEqual(['Overview', 'Team', 'Sales', 'Reports', 'Messages', 'Settings', 'Complaints']);
  });

  it('leaves the owner a non-empty More sheet, so the button always renders', () => {
    expect(nav.more.length).toBeGreaterThan(0);
  });

  it('offers the owner the public check-in link', () => {
    expect(nav.showCheckInLink).toBe(true);
  });

  it('does not duplicate Overview between the bottom nav and the More sheet', () => {
    const hrefs = [...nav.primary, ...nav.more].map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('buildNavSections — mobile More sheet covers the desktop sidebar exactly', () => {
  it.each(['org_owner', 'location_manager', 'front_desk', 'barber'])('loses nothing on mobile for %s', (role) => {
    const nav = buildNavSections(role, BASE, true);
    const sidebar = [...nav.primary, ...nav.management, ...nav.customer].map((item) => item.href);
    const mobile = [...nav.primary, ...nav.more].map((item) => item.href);
    expect(new Set(mobile)).toEqual(new Set(sidebar));
  });
});

describe('buildNavSections — other roles', () => {
  it('matches the owner for a location manager', () => {
    expect(labels(buildNavSections('location_manager', BASE, true).more))
      .toEqual(labels(buildNavSections('org_owner', BASE, true).more));
  });

  it('gives front desk only its own subset', () => {
    const nav = buildNavSections('front_desk', BASE, true);
    expect(labels(nav.management)).toEqual(['Sales', 'Messages']);
    expect(labels(nav.more)).toEqual(['Sales', 'Messages', 'Complaints']);
    expect(nav.showCheckInLink).toBe(true);
  });

  it('gives a barber no Manage or Customer sections at all', () => {
    const nav = buildNavSections('barber', BASE, true);
    expect(nav.management).toEqual([]);
    expect(nav.customer).toEqual([]);
    expect(nav.more).toEqual([]);
    expect(nav.showCheckInLink).toBe(false);
  });

  it('puts Overview in the bottom nav for non-managers, who have no More sheet to hold it', () => {
    expect(labels(buildNavSections('barber', BASE, true).primary)).toContain('Overview');
    expect(labels(buildNavSections('org_owner', BASE, true).primary)).not.toContain('Overview');
  });
});

describe('buildNavSections — communications toggle', () => {
  it('drops Messages everywhere when communications are disabled', () => {
    const nav = buildNavSections('org_owner', BASE, false);
    expect(labels(nav.management)).not.toContain('Messages');
    expect(labels(nav.more)).not.toContain('Messages');
  });

  it('still gives the owner the rest of Manage when communications are off', () => {
    expect(labels(buildNavSections('org_owner', BASE, false).more))
      .toEqual(['Overview', 'Team', 'Sales', 'Reports', 'Settings', 'Complaints']);
  });
});

describe('buildNavSections — hrefs', () => {
  it('scopes every item to the given location base', () => {
    const nav = buildNavSections('org_owner', '/locations/abc', true);
    for (const item of [...nav.primary, ...nav.management, ...nav.customer]) {
      expect(item.href.startsWith('/locations/abc')).toBe(true);
    }
  });

  it('marks Overview exact so it does not stay active on every nested route', () => {
    const overview = buildNavSections('org_owner', BASE, true).management.find((item) => item.label === 'Overview');
    expect(overview).toMatchObject({ href: BASE, exact: true });
  });
});
