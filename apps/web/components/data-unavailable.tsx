'use client';

import { Button } from './ui';

/**
 * Shown when a screen's data could not be loaded.
 *
 * This exists because of a genuine outage that nobody could see. The queue
 * board's request was returning 500 on every load — `queue_entries.late_arrival`
 * was missing from the database because a migration had never been applied —
 * and the page rendered anyway: every list fell back to `?? []`, so a total
 * failure looked like a calm, empty shop.
 *
 *   "No staff clocked in yet."   (team ?? [])
 *   "No one is waiting."         (waiting ?? [])
 *   "+ clock in" disabled        (offShiftTeam ?? [])
 *
 * The owner spent an evening convinced the clock-in button was broken. A
 * barber mid-rush would have believed the queue was genuinely empty and gone
 * home, which is the version of this that costs real money.
 *
 * The rule: **an empty state means "we asked and there is nothing". It must
 * never mean "we could not ask".** When a query fails, say so, say what it
 * usually means, and give a way to retry — never render a plausible-looking
 * nothing.
 */
export function DataUnavailable({
  what,
  error,
  onRetry,
  retrying = false,
}: {
  /** What failed to load, in the reader's language: "the floor", "today's schedule". */
  what: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : null;

  return (
    <div
      role="alert"
      className="rounded-2xl border border-[#e6bfae] bg-[#fdf4f0] px-4 py-5 text-[#7d3c22]"
      data-testid="data-unavailable"
    >
      <h2 className="text-base font-semibold">Could not load {what}</h2>
      <p className="mt-1 text-sm leading-5">
        This is a loading failure, not an empty shop — whatever is really on the floor is not
        being shown. Nothing here is safe to act on until it loads.
      </p>
      {detail && (
        <p className="mt-2 break-words font-mono text-xs text-[#96604a]" data-testid="data-unavailable-detail">
          {detail}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-[#96604a]">
        If this persists, the most common cause is a database migration that has not been applied
        yet — see <code>db/README.md</code>.
      </p>
      {onRetry && (
        <div className="mt-4">
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </Button>
        </div>
      )}
    </div>
  );
}
