'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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
export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
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
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-black/10 bg-white shadow-lg py-1">
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
        </div>
      )}
    </div>
  );
}

/** Right-aligned "+ clock in" dropdown listing off-shift staff, instead of a button per off-duty chip. */
export function ClockInDropdown({ offStaff, onClockIn }: { offStaff: { locationStaffId: string; fullName: string }[]; onClockIn: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));
  if (offStaff.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-black">
        + clock in
        <svg width="10" height="6" viewBox="0 0 10 6" className="text-gray-400">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-black/10 bg-white shadow-lg py-1">
          {offStaff.map((s) => (
            <button
              key={s.locationStaffId}
              onClick={() => {
                onClockIn(s.locationStaffId);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-black/5"
            >
              {s.fullName}
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
