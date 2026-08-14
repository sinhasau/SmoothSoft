'use client';

import Link from 'next/link';

/**
 * A link into a specific shop, for owner-workspace headers that point at
 * "the first location".
 *
 * This exists because those headers interpolated the location id directly:
 *
 *   <Link href={`/locations/${data.locations[0]?.locationId}`}>Open a shop</Link>
 *
 * An organization with no locations yet made that render
 * `/locations/undefined/staff` — a live-looking button leading to a broken
 * route, and the very first thing a new owner would click.
 *
 * Rather than hide the control when there is nowhere to go, it renders
 * disabled with the reason visible on the control itself. A control that
 * disappears when it does not apply cannot be found by someone looking for it,
 * and `title` is invisible on touch devices — so the reason is real text.
 */
export function ShopLink({
  locationId,
  /** Path appended after `/locations/<id>`, e.g. `/staff`. */
  suffix = '',
  className,
  children,
  /** Why the control is unavailable, shown on the control when it is. */
  emptyReason,
}: {
  locationId: string | undefined;
  suffix?: string;
  className: string;
  children: React.ReactNode;
  emptyReason: string;
}) {
  if (!locationId) {
    return (
      <span aria-disabled="true" className={`${className} cursor-not-allowed opacity-60`}>
        {children}
        <span className="ml-2 text-xs font-normal">({emptyReason})</span>
      </span>
    );
  }
  return (
    <Link href={`/locations/${locationId}${suffix}`} className={className}>
      {children}
    </Link>
  );
}
