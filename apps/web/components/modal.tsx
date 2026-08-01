'use client';

/**
 * The one modal shell. Previously each page carried its own copy, which is how
 * the same mobile bug shipped in two places at once: a fixed `pt-24` offset
 * plus a `max-h-[86vh]` panel sums to more than a phone viewport, pushing the
 * panel's bottom — and whatever submit button lives there — off the screen
 * with no way to scroll to it.
 *
 * Two rules keep that from recurring:
 *
 * 1. The backdrop scrolls (`overflow-y-auto`), not just the panel. Even if the
 *    panel exceeds the space left over, its bottom stays reachable.
 * 2. Heights are in `dvh`, not `vh`. Mobile browsers measure `vh` against the
 *    viewport with the URL bar hidden, so a `vh`-sized panel hangs off the
 *    bottom of the screen the whole time that bar is showing.
 *
 * The bottom padding clears the iOS home indicator so the last control is
 * never sitting under it.
 */
export function Modal({
  children,
  onClose,
  wide = false,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  label?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-[2px] sm:pt-24"
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`my-auto max-h-[calc(100dvh-2rem)] w-full sm:max-h-[86dvh] ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-black/5`}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-panel"
      >
        {children}
      </div>
    </div>
  );
}
