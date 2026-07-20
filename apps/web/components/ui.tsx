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
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatCard({ label, value, valueClassName, onClick }: { label: string; value: React.ReactNode; valueClassName?: string; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`rounded-xl bg-white/60 border border-black/5 px-5 py-4 text-left ${onClick ? 'cursor-pointer hover:bg-white' : ''}`}
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueClassName ?? ''}`}>{value}</div>
    </Comp>
  );
}

export function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
        active ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-ink hover:border-black/30'
      }`}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-black/10 bg-white/60 ${className ?? ''}`}>{children}</div>;
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
  const base = 'rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    default: 'border border-black/15 bg-white hover:border-black/40',
    solid: 'bg-black text-white hover:bg-black/85',
    ghost: 'hover:bg-black/5',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}

export function ClickableName({ id, name, href }: { id: string | null; name: string | null; href: (id: string) => string }) {
  if (!id) {
    return <span className="text-gray-500">{name ?? 'Guest'} · no profile</span>;
  }
  return (
    <Link href={href(id)} className="underline decoration-gray-300 underline-offset-2 hover:decoration-black">
      {name}
    </Link>
  );
}
