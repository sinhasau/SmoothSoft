import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Turns "this database is behind the code" into a message that says so.
 *
 * This has now bitten three times, each time the same shape: a migration and
 * the code that depends on it ship in one change, the migration is not applied,
 * and Postgres raises `undefined_table` or `undefined_column` — which Nest
 * renders as a bare 500 `"Internal server error"`.
 *
 * The third time was the worst. `/dashboard/org` began selecting the staff
 * contact columns added in 0054, and that single endpoint powers EVERY page in
 * the owner workspace — Home, Locations, Team, Payroll, Reports. One unapplied
 * migration took all five down at once and said nothing about why.
 *
 * 503, not 500: the API is running ahead of its schema, which is a deployment
 * ordering problem rather than a bug, and it recovers the moment the migration
 * runs. Retrying cannot help, so the message says what to run instead.
 *
 * `42501` (insufficient_privilege) is included because applying a migration is
 * only half the job — a new table arrives with no grants for the app role, and
 * that failed identically from the outside.
 *
 * This is damage control, NOT a fix for the ordering problem. Nothing here
 * stops a migration and its dependent code shipping together; it only makes the
 * result legible. See CLAUDE.md on expand/contract sequencing.
 */
export function rethrowIfSchemaBehind(what: string, migration: string) {
  return (error: unknown): never => {
    const code = (error as { code?: string } | null)?.code;
    if (code === '42P01' || code === '42703') {
      throw new ServiceUnavailableException(
        `${what} needs database migration ${migration}, which has not been applied to this database yet. ` +
          'Run the "Migrate production database" workflow from the Actions tab (or npm run db:migrate), then reload.',
      );
    }
    if (code === '42501') {
      throw new ServiceUnavailableException(
        `${what}: migration ${migration} is applied but the app role cannot read it — grants were not run. ` +
          'Run "npm run db:grant-app-role", then reload.',
      );
    }
    throw error;
  };
}
