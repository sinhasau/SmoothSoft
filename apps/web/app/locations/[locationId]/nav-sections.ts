export interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

export interface NavSections {
  primary: NavItem[];
  management: NavItem[];
  customer: NavItem[];
  /** Everything the 4-slot mobile bottom nav can't show, for the "More" sheet. */
  more: NavItem[];
  /** Whether the role sees the public check-in link alongside the customer section. */
  showCheckInLink: boolean;
}

/**
 * Single source of truth for the location nav, shared by the desktop sidebar
 * and the mobile bottom nav / More sheet. Extracted from the layout so the
 * two can't drift — a section that exists on desktop but not mobile is
 * exactly the bug this prevents.
 */
export function buildNavSections(role: string, base: string, communicationsEnabled: boolean): NavSections {
  const isManager = role === 'org_owner' || role === 'location_manager';
  const isFrontDesk = role === 'front_desk';

  const primary: NavItem[] = [
    { href: `${base}/queue`, label: 'Today', icon: '◉' },
    { href: `${base}/appointments`, label: 'Appointments', icon: '◷' },
    { href: `${base}/schedule`, label: 'Schedule', icon: '▦' },
    { href: `${base}/clients`, label: 'Clients', icon: '♙' },
    ...(!isManager ? [{ href: base, label: 'Overview', icon: '⌂', exact: true }] : []),
  ];

  const management: NavItem[] = isManager
    ? [
      { href: base, label: 'Overview', icon: '⌂', exact: true },
      { href: `${base}/staff`, label: 'Team', icon: '♧' },
      { href: `${base}/sales`, label: 'Sales', icon: '$' },
      { href: `${base}/reports`, label: 'Reports', icon: '↗' },
      ...(communicationsEnabled ? [{ href: `${base}/communications`, label: 'Messages', icon: '✉' }] : []),
      { href: `${base}/settings`, label: 'Settings', icon: '⚙' },
    ]
    : isFrontDesk
      ? [
        { href: `${base}/sales`, label: 'Sales', icon: '$' },
        ...(communicationsEnabled ? [{ href: `${base}/communications`, label: 'Messages', icon: '✉' }] : []),
      ]
      : [];

  // Its own section (not folded into Manage/Front desk) so it reads as customer-facing
  // operations rather than a back-office setting — visible to the same audience that acts
  // on complaints (front desk + managers).
  const customer: NavItem[] = (isManager || isFrontDesk)
    ? [{ href: `${base}/complaints`, label: 'Complaints', icon: '⚑' }]
    : [];

  const more = [...management, ...customer].filter((item) => !primary.some((p) => p.href === item.href));

  return { primary, management, customer, more, showCheckInLink: customer.length > 0 };
}
