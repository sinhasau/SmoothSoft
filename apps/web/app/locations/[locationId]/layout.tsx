'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../../lib/auth';
import { setActiveLocationId } from '../../../lib/api';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { buildNavSections } from './nav-sections';

export default function LocationLayout({ children, params }: { children: React.ReactNode; params: { locationId: string } }) {
  const auth = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const base = `/locations/${params.locationId}`;
  const [moreOpen, setMoreOpen] = useState(false);
  // Mobile has no room for the desktop sidebar's separate Manage/Customer
  // sections in the fixed 4-slot bottom nav — this is the one entry point
  // to Team/Sales/Reports/Settings/Complaints/the check-in link on a phone,
  // so it must stay in sync with whatever the sidebar shows a manager or
  // front-desk person on desktop.
  useEffect(() => setMoreOpen(false), [pathname]);

  // The dev sign-in picker (see /login) has no session concept of its own —
  // this is the only way back to it once you're in as a given role. Clearing
  // the ['auth','me'] cache makes useRequireAuth's own effect do the redirect,
  // so this doesn't need to duplicate that logic.
  //
  // Clear the cache and navigate in onMutate (before the request resolves),
  // not onSuccess: this is only a client-side cookie clear, so there's no
  // reason to make the user wait out a slow/cold API round-trip just to
  // leave the page they're already trying to leave.
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onMutate: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      // Warm the login page's roster query before navigating there — the roster
      // rarely changes, so this turns the picker into an instant, cached render
      // instead of a fresh "Loading staff roster…" spinner on every switch.
      queryClient.prefetchQuery({ queryKey: ['auth', 'roster'], queryFn: () => api.get('/auth/roster') });
      router.replace('/login');
    },
  });

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
  // Shared by the desktop sidebar and the mobile bottom nav / More sheet, so a
  // section can never exist on one and not the other — see nav-sections.ts.
  const { primary, management, customer, more, showCheckInLink } = buildNavSections(
    auth.role,
    base,
    communicationSettings.data?.enabled !== false,
  );
  const isActive = (item: { href: string; exact?: boolean }) => item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const isMoreActive = more.some(isActive);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand"><span className="brand-mark">S</span><div><strong>SmoothSoft</strong><span>JJ&apos;s Barbers</span></div></div>
        <nav aria-label="Primary navigation">
          {auth.role === 'org_owner' && <><span className="nav-section-label">Owner workspace</span><Link href="/org" className="app-nav-link"><span aria-hidden="true">←</span>Back to organization</Link><span className="nav-section-label">This location</span></>}
          <span className="nav-section-label">Operate</span>
          {primary.map((item) => <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
          {management.length > 0 && <><span className="nav-section-label">{isManager ? 'Manage' : 'Front desk'}</span>{management.map((item) => <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</>}
          {showCheckInLink && (
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
        <div className="sidebar-user">
          <span className="avatar">{auth.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</span>
          <div><strong>{auth.fullName}</strong><span>{auth.role.replace('_', ' ')}</span></div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label="Switch user"
            title="Switch user"
            className="ml-1 shrink-0 text-xs font-medium text-gray-400 hover:text-black disabled:opacity-40"
          >
            Switch
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-app-header">
          <div className="app-brand"><span className="brand-mark">S</span><div><strong>SmoothSoft</strong><span>JJ&apos;s Barbers</span></div></div>
          <div className="mobile-header-actions">
            {auth.role === 'org_owner' && <Link href="/org" className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-medium">Organization</Link>}
            <span className="avatar">{auth.fullName[0]}</span>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              aria-label="Switch user"
              title="Switch user"
              className="mobile-switch-user"
            >
              Switch
            </button>
          </div>
        </header>
        <div className="app-content">{children}</div>
      </div>
      {moreOpen && (
        <>
          <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="mobile-more-sheet" role="dialog" aria-label="More">
            {more.map((item) => (
              <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`} onClick={() => setMoreOpen(false)}>
                <span aria-hidden="true">{item.icon}</span>{item.label}
              </Link>
            ))}
            {showCheckInLink && (
              <a href={`/book/${params.locationId}`} target="_blank" rel="noopener noreferrer" className="app-nav-link" onClick={() => setMoreOpen(false)}>
                <span aria-hidden="true">↗</span>Check-in link
              </a>
            )}
            {/* Desktop reaches this via the sidebar's user row, which is hidden on
                mobile — without it an owner has no route to the org dashboard on a phone. */}
            {auth.role === 'org_owner' && (
              <Link href="/org" className="app-nav-link" onClick={() => setMoreOpen(false)}>
                <span aria-hidden="true">↗</span>Owner dashboard
              </Link>
            )}
          </div>
        </>
      )}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {primary.map((item) => <Link key={item.href} href={item.href} className={isActive(item) ? 'active' : ''}><span>{item.icon}</span>{item.label}</Link>)}
        {more.length > 0 && (
          <button type="button" onClick={() => setMoreOpen((open) => !open)} className={isMoreActive || moreOpen ? 'active' : ''} aria-expanded={moreOpen} aria-label="More">
            <span>•••</span>More
          </button>
        )}
      </nav>
    </div>
  );
}
