'use client';

/**
 * The one modal shell. Previously each page carried its own copy, which is how
 * the same mobile bug shipped in two places at once: a fixed `pt-24` offset
 * plus a `max-h-[86vh]` panel sums to more than a phone viewport, pushing the
 * panel's bottom — and whatever submit button lives there — off the screen
 * with no way to scroll to it.
 *
 * Three rules keep that from recurring:
 *
 * 1. The backdrop scrolls (`overflow-y-auto`), not just the panel. Even if the
 *    panel exceeds the space left over, its bottom stays reachable.
 *    `overscroll-contain` stops that scroll chaining to the page behind.
 * 2. Heights are in `dvh`, not `vh`. Mobile browsers measure `vh` against the
 *    viewport with the URL bar hidden, so a `vh`-sized panel hangs off the
 *    bottom of the screen the whole time that bar is showing.
 * 3. The bottom padding clears the iOS home indicator so the last control is
 *    never sitting under it. This only works because `app/layout.tsx` sets
 *    `viewportFit: 'cover'` — without it `env(safe-area-inset-bottom)` is 0
 *    and the `max()` silently picks the fallback on every device.
 *
 * Three hand-rolled copies still existed after the first consolidation (the
 * checkout shell, the sale receipt/refund pair, and the staff onboarding
 * form), each missing a different one of the rules above. The props below
 * exist so those callers have nothing left to hand-roll: they were the actual
 * reasons someone reached for a bespoke overlay instead.
 */
export function Modal({
  children,
  onClose,
  wide = false,
  size,
  label,
  padded = true,
  dismissible = true,
  elevated = false,
  panelClassName = '',
  panelRef,
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** @deprecated Use `size="xl"`. Kept so existing callers keep working. */
  wide?: boolean;
  /**
   * Panel width. `board` is for the checkout, which lays out in two columns
   * and needs more room than a form dialog.
   */
  size?: 'md' | 'lg' | 'xl' | 'board';
  label?: string;
  /**
   * Set false when the content brings its own full-bleed header/footer bands,
   * so they can span the panel edge to edge. The safe-area bottom padding is
   * kept either way — that one is not decorative.
   */
  padded?: boolean;
  /** Set false while a submit is in flight, so a stray backdrop tap can't discard it. */
  dismissible?: boolean;
  /**
   * Set when this modal opens on top of another one (the refund dialog over
   * the sale receipt). The z-index has to go on the backdrop, not the panel —
   * the backdrop is the positioned element, so raising only the panel leaves
   * the second dialog behind the first one's scrim.
   */
  elevated?: boolean;
  /** Extra panel classes, for callers with their own surface treatment. */
  panelClassName?: string;
  /** Escape hatch for callers that need to control the panel's scroll position. */
  panelRef?: React.Ref<HTMLDivElement>;
}) {
  const width = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    // 960px, matching the checkout's previous hand-rolled w-[min(960px,100%)].
    board: 'max-w-[60rem]',
  }[size ?? (wide ? 'xl' : 'md')];

  return (
    <div
      className={`fixed inset-0 ${elevated ? 'z-[60]' : 'z-50'} flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-[2px] sm:pt-24`}
      onClick={dismissible ? onClose : undefined}
      data-testid="modal-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`my-auto max-h-[calc(100dvh-2rem)] w-full sm:max-h-[86dvh] ${width} ${padded ? 'p-6' : ''} overflow-y-auto rounded-2xl bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-black/5 ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-panel"
      >
        {children}
      </div>
    </div>
  );
}
