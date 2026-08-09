'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Closes an open dropdown/menu on outside click — shared by StatusDropdown and RowMenu. */
function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

const STATUS_DOT: Record<string, string> = {
  available: 'bg-green-500',
  busy: 'bg-blue-500',
  break: 'bg-amber-500',
  off: 'bg-gray-300',
};

/** A clean pill dropdown (dot + label + chevron) instead of a native <select> box. */
export function StatusDropdown({
  status,
  onChange,
}: {
  status: 'available' | 'busy' | 'break' | 'off';
  onChange: (status: 'available' | 'break' | 'off') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));
  const options: { value: 'available' | 'break' | 'off'; label: string }[] = [
    { value: 'available', label: 'Available' },
    { value: 'break', label: 'Break' },
    { value: 'off', label: 'Off' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => status !== 'busy' && setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-sm ${status === 'busy' ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <span className="capitalize text-gray-500">{status}</span>
        {status !== 'busy' && (
          <svg width="10" height="6" viewBox="0 0 10 6" className="text-gray-400">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-32 rounded-lg border border-black/10 bg-white shadow-lg py-1">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-black/5"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[o.value]}`} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  hidden?: boolean;
}

/** The "⋮" row-action menu — houses secondary actions (No-show, Abandoned, Cancel, Reassign…) off the main row. */
/**
 * Renders its dropdown into a document.body portal, positioned by the
 * trigger button's own viewport coordinates — several call sites live
 * inside cards with `overflow-hidden` (rounded-corner clipping), which
 * would otherwise silently clip an absolutely-positioned dropdown near
 * the bottom of the card instead of showing its items.
 */
export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const MENU_WIDTH = 192; // w-48
    const menuHeight = visible.length * 34 + 8;
    const left = Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8);
    const top = rect.bottom + menuHeight > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 4)
      : rect.bottom + 4;
    setCoords({ top, left });
  }, [open, visible.length]);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/5 text-gray-500"
        aria-label="More actions"
      >
        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.8" />
          <circle cx="2" cy="8" r="1.8" />
          <circle cx="2" cy="14" r="1.8" />
        </svg>
      </button>
      {open && coords && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} className="fixed z-[100] w-48 rounded-lg border border-black/10 bg-white shadow-lg py-1" style={{ top: coords.top, left: coords.left }}>
          {visible.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 ${item.destructive ? 'text-red-600' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export interface ClockInCandidate {
  locationStaffId: string;
  fullName: string;
  /** On today's schedule at this location. Absent on responses from an older API build. */
  scheduledToday?: boolean;
  /** Absent on responses from an older API build; treated as active. */
  employmentStatus?: 'active' | 'inactive' | 'resigned';
}

/**
 * "+ clock in" — the control for putting a barber on the floor.
 *
 * Three rules, each of which was learned by breaking it:
 *
 * 1. **It never hides itself.** It used to `return null` when nobody was off
 *    shift, so anyone looking for it while the shop was fully staffed found
 *    nothing and concluded the feature was missing.
 * 2. **It never silently drops a person.** Both groupings below — not
 *    scheduled, not active — are *labelled reveals*, never filters. A version
 *    that quietly filtered out non-active staff locked an owner out of his own
 *    shop: every barber at that location was marked inactive, so the list came
 *    back empty, the button disabled, and the message claimed "Everyone is
 *    already clocked in" while the strip beside it said "No staff clocked in
 *    yet". Whoever is on the roster is reachable from here, always.
 * 3. **It never blocks a fill-in.** Clocking in someone off-schedule has always
 *    been allowed by the API — the shop runs on live clock state, and covering
 *    on a day off is a normal Saturday. Grouping decides what leads, not what
 *    is possible.
 *
 * Rows are `min-h-11` (44px) because this gets used on a phone, at the counter,
 * often one-handed.
 */
export function ClockInDropdown({ offStaff, onClockIn, rosterCount }: {
  /** Everyone on this location's roster who is not currently on the floor. */
  offStaff: ClockInCandidate[];
  onClockIn: (id: string) => void;
  /**
   * How many staff this location has at all. Without it the control cannot
   * tell "everyone is already on the floor" from "this location has nobody on
   * its roster" — two very different problems that looked identical.
   */
  rosterCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const close = () => { setOpen(false); setRevealed(new Set()); };
  const ref = useOutsideClick(close);

  const isActive = (s: ClockInCandidate) => (s.employmentStatus ?? 'active') === 'active';
  const active = offStaff.filter(isActive);
  const inactive = offStaff.filter((s) => !isActive(s));

  // An older API build omits scheduledToday entirely. Nothing is then known to
  // be scheduled, so everyone belongs in the lead group rather than behind a
  // reveal that looks broken.
  const scheduleKnown = active.some((s) => s.scheduledToday !== undefined);
  const scheduledToday = scheduleKnown ? active.filter((s) => s.scheduledToday) : [];
  // Only lead with the scheduled group when there IS one. On a Sunday, or at a
  // shop that does not keep weekly schedules current, nobody is scheduled — and
  // a menu that opens onto no names reads as broken.
  const split = scheduledToday.length > 0;

  const lead = split ? scheduledToday : active;
  const groups = [
    split && { key: 'unscheduled', label: 'Not scheduled', heading: 'Not scheduled today', people: active.filter((s) => !s.scheduledToday) },
    { key: 'inactive', label: 'Not active', heading: 'Not marked active', people: inactive },
  ].filter(Boolean) as { key: string; label: string; heading: string; people: ClockInCandidate[] }[];

  // Disabled only when there is genuinely nobody to put on the floor — never
  // because a grouping rule ate the whole list.
  const empty = offStaff.length === 0;
  const rosterEmpty = rosterCount !== undefined ? rosterCount === 0 : false;

  const pick = (id: string) => { onClockIn(id); close(); };

  const row = (s: ClockInCandidate) => (
    <button
      key={s.locationStaffId}
      onClick={() => pick(s.locationStaffId)}
      className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm hover:bg-black/5"
    >
      {s.fullName}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !empty && setOpen((v) => !v)}
        disabled={empty}
        aria-expanded={open}
        className={`flex min-h-11 items-center gap-1 rounded-lg border border-[#dedbd2] bg-white px-3 text-sm font-medium ${
          empty ? 'cursor-default text-gray-400' : 'text-[#383d3a] hover:border-[#315f52]/40 hover:text-black'
        }`}
      >
        + clock in
        {!empty && (
          <svg width="10" height="6" viewBox="0 0 10 6" className="text-gray-400">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {/*
        Rendered text, not a title attribute. A title never appears on a touch
        device, so on the phone this button previously sat there disabled and
        explained nothing.
      */}
      {empty && (
        <p className="mt-1 text-right text-[11px] leading-4 text-[#77736b]">
          {rosterEmpty ? 'No barbers on this location yet — add them in Staff.' : 'Everyone is already clocked in.'}
        </p>
      )}
      {open && !empty && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-[60dvh] w-56 overflow-y-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          {lead.map(row)}
          {groups.filter((g) => g.people.length > 0).map((g) => revealed.has(g.key) ? (
            <div key={g.key}>
              <p className="mt-1 border-t border-black/10 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#77736b]">
                {g.heading}
              </p>
              {g.people.map(row)}
            </div>
          ) : (
            <button
              key={g.key}
              type="button"
              onClick={() => setRevealed((prev) => new Set(prev).add(g.key))}
              className="mt-1 flex min-h-11 w-full items-center border-t border-black/10 px-3 py-2 text-left text-sm text-gray-600 hover:bg-black/5 hover:text-black"
            >
              {g.label} ({g.people.length})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'amber' | 'red' | 'green' | 'gray'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    amber: 'border border-amber-200/70 bg-amber-50 text-amber-800',
    red: 'border border-red-200/70 bg-red-50 text-red-700',
    green: 'border border-emerald-200/70 bg-emerald-50 text-emerald-800',
    gray: 'border border-stone-200/80 bg-stone-50 text-stone-600',
  };
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function StatCard({ label, value, valueClassName, onClick }: { label: string; value: React.ReactNode; valueClassName?: string; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`rounded-2xl border border-black/[0.06] bg-gradient-to-br from-white/90 to-[#fbfaf6]/90 px-5 py-4 text-left shadow-[0_8px_24px_rgba(60,48,30,0.045)] transition ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#9bb5aa]/60 hover:shadow-[0_12px_28px_rgba(48,82,68,0.08)]' : ''}`}
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueClassName ?? ''}`}>{value}</div>
    </Comp>
  );
}

export function TabLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  // Sub-routes (e.g. /clients/[id], /staff/[id]) should still highlight
  // their parent tab — exact match only for the root Dashboard tab,
  // whose href is a literal prefix of every other tab's href.
  const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
        active ? 'border-[#315c4f] bg-[#315c4f] text-white shadow-sm' : 'border-black/10 bg-white/80 text-ink hover:border-[#78988d] hover:bg-white'
      }`}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-black/[0.07] bg-white/80 shadow-[0_8px_24px_rgba(60,48,30,0.04)] ${className ?? ''}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'solid' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    default: 'border border-black/10 bg-white/90 shadow-sm hover:border-[#78988d] hover:bg-white',
    solid: 'bg-[#294f44] text-[#fffdf7] shadow-sm hover:bg-[#1f4037] hover:shadow-md',
    ghost: 'hover:bg-[#edf3f0] hover:text-[#244a40]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}

/** Dotted-underline clickable link for a name with a profile; plain muted text (never a boxed/grey container) when there isn't one. */
export function ClickableName({ id, name, href }: { id: string | null; name: string | null; href: (id: string) => string }) {
  if (!id) {
    return <span className="text-gray-500">{name ?? 'Guest'} · no profile</span>;
  }
  return (
    <Link href={href(id)} className="underline decoration-dotted decoration-gray-400 underline-offset-2 hover:decoration-black">
      {name}
    </Link>
  );
}
