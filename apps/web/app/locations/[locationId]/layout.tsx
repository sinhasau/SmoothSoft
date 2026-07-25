'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../../lib/auth';
import { setActiveLocationId } from '../../../lib/api';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

export default function LocationLayout({ children, params }: { children: React.ReactNode; params: { locationId: string } }) {
  const auth = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const base = `/locations/${params.locationId}`;

  // Every API call under this layout goes to params.locationId — see
  // apps/web/lib/api.ts. Only org_owner is actually allowed to view a
  // location other than their own (enforced server-side too); anyone else
  // navigating to a foreign location's URL gets bounced back to their own.
  //
  // Set synchronously during render, NOT in a useEffect: React fires
  // effects child-first, so by the time this layout's effect would run,
  // the child page's useQuery has already dispatched its fetch — one
  // render too late, headerless. A parent's render body always runs
  // before any child renders, so this is the one place guaranteed to land
  // before every descendant's data fetch.
  setActiveLocationId(params.locationId);
  const communicationSettings = useQuery({ queryKey: ['settings', 'communication-settings', params.locationId], queryFn: () => api.get<{ enabled: boolean }>('/settings/communication-settings'), enabled: !!auth });
  useEffect(() => () => setActiveLocationId(null), []);

  useEffect(() => {
    if (auth && auth.role !== 'org_owner' && auth.locationId !== params.locationId) {
      router.replace(`/locations/${auth.locationId}`);
    }
  }, [auth, params.locationId, router]);

  if (!auth) return null;
  if (auth.role !== 'org_owner' && auth.locationId !== params.locationId) return null;

  const isManager = auth.role === 'org_owner' || auth.role === 'location_manager';
  const isFrontDesk = auth.role === 'front_desk';
  const primary = [
    { href: `${base}/queue`, label: 'Today', icon: '◉' },
    { href: `${base}/appointments`, label: 'Appointments', icon: '◷' },
    { href: `${base}/schedule`, label: 'Schedule', icon: '▦' },
    { href: `${base}/clients`, label: 'Clients', icon: '♙' },
    ...(!isManager ? [{ href: base, label: 'Overview', icon: '⌂', exact: true }] : []),
  ];
  const management = isManager ? [
    { href: base, label: 'Overview', icon: '⌂', exact: true },
      { href: `${base}/staff`, label: 'Team', icon: '♧' },
      { href: `${base}/sales`, label: 'Sales', icon: '$' },
      { href: `${base}/reports`, label: 'Reports', icon: '↗' },
      ...(communicationSettings.data?.enabled !== false ? [{ href: `${base}/communications`, label: 'Messages', icon: '✉' }] : []),
      { href: `${base}/settings`, label: 'Settings', icon: '⚙' },
  ] : isFrontDesk ? [
    { href: `${base}/sales`, label: 'Sales', icon: '$' },
    ...(communicationSettings.data?.enabled !== false ? [{ href: `${base}/communications`, label: 'Messages', icon: '✉' }] : []),
  ] : [];
  // Its own section (not folded into Manage/Front desk) so it reads as customer-facing
  // operations rather than a back-office setting — visible to the same audience that acts
  // on complaints (front desk + managers).
  const customer = (isManager || isFrontDesk) ? [
    { href: `${base}/complaints`, label: 'Complaints', icon: '⚑' },
  ] : [];
  const isActive = (item: { href: string; exact?: boolean }) => item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand"><span className="brand-mark">S</span><div><strong>SmoothSoft</strong><span>JJ&apos;s Barbers</span></div></div>
        <nav aria-label="Primary navigation">
          <span className="nav-section-label">Operate</span>
          {primary.map((item) => <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
          {management.length > 0 && <><span className="nav-section-label">{isManager ? 'Manage' : 'Front desk'}</span>{management.map((item) => <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</>}
          {customer.length > 0 && (
            <>
              <span className="nav-section-label">Customer</span>
              {customer.map((item) => <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
              {/* A separate top-level, unauthenticated route (not nested under this
                  layout) — opens in a new tab so staff keep their place on the Floor
                  instead of navigating away from the authenticated app. */}
              <a href={`/book/${params.locationId}`} target="_blank" rel="noopener noreferrer" className="app-nav-link">
                <span aria-hidden="true">↗</span>Check-in link
              </a>
            </>
          )}
        </nav>
        <div className="sidebar-user"><span className="avatar">{auth.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>{auth.fullName}</strong><span>{auth.role.replace('_', ' ')}</span></div>{auth.role === 'org_owner' && <Link href="/org" aria-label="Open owner dashboard">↗</Link>}</div>
      </aside>
      <div className="app-main">
        <header className="mobile-app-header"><div className="app-brand"><span className="brand-mark">S</span><div><strong>SmoothSoft</strong><span>JJ&apos;s Barbers</span></div></div><span className="avatar">{auth.fullName[0]}</span></header>
        <div className="app-content">{children}</div>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {primary.map((item) => <Link key={item.href} href={item.href} className={isActive(item) ? 'active' : ''}><span>{item.icon}</span>{item.label}</Link>)}
        <Link href={base} className={pathname === base ? 'active' : ''}><span>•••</span>More</Link>
      </nav>
    </div>
  );
}
