'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, setActiveLocationId } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { useOwnerDashboard } from './use-owner-dashboard';

const NAV = [
  { href: '/org', label: 'Home', icon: '⌂', exact: true },
  { href: '/org/locations', label: 'Locations', icon: '◇' },
  { href: '/org/team', label: 'Team', icon: '♧' },
  { href: '/org/payroll', label: 'Payroll', icon: '$' },
  { href: '/org/reports', label: 'Reports', icon: '↗' },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const auth = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  setActiveLocationId(null);
  const dashboard = useOwnerDashboard(!!auth && auth.role === 'org_owner');

  useEffect(() => {
    if (auth && auth.role !== 'org_owner') router.replace(`/locations/${auth.locationId}`);
  }, [auth, router]);

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onMutate: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      router.replace('/login');
    },
  });

  if (!auth || auth.role !== 'org_owner') return null;
  const isActive = (item: (typeof NAV)[number]) => item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const organizationName = dashboard.data?.organization.name ?? 'Your business';

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/org" className="app-brand"><span className="brand-mark">S</span><div><strong>SmoothSoft</strong><span>{organizationName}</span></div></Link>
        <nav aria-label="Owner navigation">
          <span className="nav-section-label">Organization</span>
          {NAV.map((item) => <Link key={item.href} href={item.href} className={`app-nav-link ${isActive(item) ? 'active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
          <span className="nav-section-label">Quick access</span>
          <Link href={`/locations/${auth.locationId}/clients`} className="app-nav-link"><span aria-hidden="true">♙</span>Clients</Link>
          <Link href={`/locations/${auth.locationId}/communications`} className="app-nav-link"><span aria-hidden="true">✉</span>Messages</Link>
          <Link href={`/locations/${auth.locationId}/settings`} className="app-nav-link"><span aria-hidden="true">⚙</span>Administration</Link>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{auth.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</span>
          <div><strong>{auth.fullName}</strong><span>organization owner</span></div>
          <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} className="ml-1 shrink-0 text-xs font-medium text-gray-400 hover:text-black disabled:opacity-40">Switch</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-app-header">
          <Link href="/org" className="app-brand"><span className="brand-mark">S</span><div><strong>SmoothSoft</strong><span>Owner</span></div></Link>
          <Link href={`/locations/${auth.locationId}`} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-medium">Open shop</Link>
        </header>
        <div className="app-content">{children}</div>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Owner mobile navigation">
        {NAV.slice(0, 4).map((item) => <Link key={item.href} href={item.href} className={isActive(item) ? 'active' : ''}><span>{item.icon}</span>{item.label}</Link>)}
        <Link href="/org/reports" className={pathname.startsWith('/org/reports') ? 'active' : ''}><span>↗</span>Reports</Link>
      </nav>
    </div>
  );
}
