import { describe, expect, it } from 'vitest';
import { canSeeStaffContact, contactFor, type ContactSubject, type ContactViewer, type StaffContact } from './staff-contact-visibility';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const NOVI = 'loc-novi';
const LYON = 'loc-lyon';

const viewer = (role: string, over: Partial<ContactViewer> = {}): ContactViewer => ({
  userId: 'viewer-1',
  role,
  organizationId: ORG_A,
  locationId: NOVI,
  ...over,
});

const subject = (over: Partial<ContactSubject> = {}): ContactSubject => ({
  userId: 'subject-1',
  organizationId: ORG_A,
  locationIds: [NOVI],
  ...over,
});

const CONTACT: StaffContact = {
  phone: '555-0100',
  email: 'barber@example.com',
  addressLine1: '12 Main St',
  addressLine2: null,
  city: 'Novi',
  region: 'MI',
  postalCode: '48375',
  country: 'US',
  emergencyContactName: 'Next of Kin',
  emergencyContactPhone: '555-0199',
};

describe('owner — cross-location within their own organization', () => {
  it('sees staff at their primary location', () => {
    expect(canSeeStaffContact(viewer('org_owner'), subject())).toBe(true);
  });

  it('sees staff at a location they are not currently working in', () => {
    // The whole point of the owner view: three shops, one screen.
    expect(canSeeStaffContact(viewer('org_owner'), subject({ locationIds: [LYON] }))).toBe(true);
  });

  it('sees staff assigned to several locations', () => {
    expect(canSeeStaffContact(viewer('org_owner'), subject({ locationIds: [NOVI, LYON] }))).toBe(true);
  });

  it('sees staff with NO location assignment yet (mid-onboarding)', () => {
    // A new hire created before assignment must not be invisible to the owner.
    expect(canSeeStaffContact(viewer('org_owner'), subject({ locationIds: [] }))).toBe(true);
  });

  it('does NOT see another organization’s staff', () => {
    // The one failure that matters most. An owner is all-powerful inside their
    // own tenant and has no reach outside it.
    expect(canSeeStaffContact(viewer('org_owner'), subject({ organizationId: ORG_B }))).toBe(false);
  });
});

describe('manager — their own location only', () => {
  it('sees staff at the location they are working in', () => {
    expect(canSeeStaffContact(viewer('location_manager'), subject({ locationIds: [NOVI] }))).toBe(true);
  });

  it('does NOT see staff at a sister location', () => {
    expect(canSeeStaffContact(viewer('location_manager'), subject({ locationIds: [LYON] }))).toBe(false);
  });

  it('sees a multi-location person, because one of their assignments is here', () => {
    expect(canSeeStaffContact(viewer('location_manager'), subject({ locationIds: [LYON, NOVI] }))).toBe(true);
  });

  it('is scoped to the ACTIVE location, not to every location they manage', () => {
    // A manager of two shops works one at a time; switching location changes
    // what they can see, which mirrors how RLS scopes the request.
    const managingLyonToday = viewer('location_manager', { locationId: LYON });
    expect(canSeeStaffContact(managingLyonToday, subject({ locationIds: [LYON] }))).toBe(true);
    expect(canSeeStaffContact(managingLyonToday, subject({ locationIds: [NOVI] }))).toBe(false);
  });

  it('does NOT see an unassigned person', () => {
    expect(canSeeStaffContact(viewer('location_manager'), subject({ locationIds: [] }))).toBe(false);
  });

  it('does NOT see another organization’s staff, even at a same-named location', () => {
    expect(canSeeStaffContact(viewer('location_manager'), subject({ organizationId: ORG_B, locationIds: [NOVI] }))).toBe(false);
  });
});

describe('staff and front desk — themselves and nobody else', () => {
  it.each(['staff', 'front_desk'])('%s cannot see a colleague at their own location', (role) => {
    expect(canSeeStaffContact(viewer(role), subject({ locationIds: [NOVI] }))).toBe(false);
  });

  it.each(['staff', 'front_desk'])('%s cannot see a colleague at another location', (role) => {
    expect(canSeeStaffContact(viewer(role), subject({ locationIds: [LYON] }))).toBe(false);
  });

  it.each(['staff', 'front_desk', 'location_manager', 'org_owner'])('%s CAN see their own details', (role) => {
    // Independent of role: you can always read what payroll will mail to you.
    const me = viewer(role, { userId: 'same-person' });
    expect(canSeeStaffContact(me, subject({ userId: 'same-person' }))).toBe(true);
  });

  it('lets someone see their own details even at a location they are not working in', () => {
    const me = viewer('staff', { userId: 'same-person', locationId: LYON });
    expect(canSeeStaffContact(me, subject({ userId: 'same-person', locationIds: [NOVI] }))).toBe(true);
  });
});

describe('fails closed', () => {
  it('an unrecognised role sees nobody but themselves', () => {
    // New roles must be added to the permissive branch deliberately.
    expect(canSeeStaffContact(viewer('regional_director'), subject())).toBe(false);
    expect(canSeeStaffContact(viewer(''), subject())).toBe(false);
  });

  it('self-match does not leak across organizations for a shared user id', () => {
    // One user CAN staff locations in two organizations (users is global, see
    // NOT_TENANT_SCOPED). Their own record is still their own.
    const me = viewer('staff', { userId: 'shared' });
    expect(canSeeStaffContact(me, subject({ userId: 'shared', organizationId: ORG_B }))).toBe(true);
  });

  it('an owner of org B cannot read org A by claiming org A’s location id', () => {
    const impostor = viewer('org_owner', { organizationId: ORG_B, locationId: NOVI });
    expect(canSeeStaffContact(impostor, subject({ organizationId: ORG_A, locationIds: [NOVI] }))).toBe(false);
  });
});

describe('contactFor', () => {
  it('returns the details when permitted', () => {
    expect(contactFor(viewer('org_owner'), subject(), CONTACT)).toEqual(CONTACT);
  });

  it('returns null — not an object of nulls — when withheld', () => {
    // A client must be able to tell "withheld from you" from "not on file", and
    // a UI must not render empty fields implying the record is incomplete.
    expect(contactFor(viewer('staff'), subject(), CONTACT)).toBeNull();
  });

  it('withholds every field together, never a partial block', () => {
    const withheld = contactFor(viewer('front_desk'), subject(), CONTACT);
    expect(withheld).toBeNull();
    // And when granted, nothing is silently dropped.
    const granted = contactFor(viewer('org_owner'), subject(), CONTACT);
    expect(Object.keys(granted!).sort()).toEqual(Object.keys(CONTACT).sort());
  });
});
