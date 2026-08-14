'use client';

import { DataUnavailable } from '../../components/data-unavailable';

/**
 * What every owner-workspace page renders while it has no data yet.
 *
 * This exists because the distinction between "still loading" and "the request
 * failed" was made independently on six pages, and five of them got it wrong
 * the same way:
 *
 *   const { data } = useOwnerDashboard();
 *   if (!data) return <p>Loading team…</p>;
 *
 * Destructuring only `data` throws the error away. When GET /dashboard/org
 * returned 500, those pages sat on "Loading team…" forever — no error, no
 * retry, no way to tell an outage from a slow network. On desktop it was worse
 * than on the phone: the sidebar rendered perfectly, so it read as a working
 * app with an empty pane rather than a failure.
 *
 * That is the same bug the queue board shipped with `?? []`, and the rule from
 * that outage applies unchanged: **an empty or loading state means "we asked".
 * It must never mean "we could not ask".** Routing every page's no-data path
 * through here means the decision is made once, correctly.
 */
export function OwnerFallback({
  query,
  what,
}: {
  /** The query itself, not its `data` — the error lives on the query. */
  query: { isError: boolean; error: unknown; refetch: () => unknown; isFetching: boolean };
  /** What is being loaded, in the reader's language: "the team", "payroll". */
  what: string;
}) {
  if (query.isError) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <DataUnavailable
          what={what}
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  return <div className="px-6 py-8 text-sm text-gray-500">Loading {what}…</div>;
}
