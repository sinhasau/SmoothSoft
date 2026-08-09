/**
 * Whether a staff member is on today's schedule at this location.
 *
 * This does NOT gate clocking in — it never has. `clockIn()` only checks that
 * the person is on the location's roster, which is deliberate: the shop runs
 * on live clock state, and someone coming in on their day off to cover is a
 * normal Saturday, not an exception to be blocked.
 *
 * What this drives is purely presentational: the "+ clock in" list shows the
 * people actually expected today, with everyone else one tap behind a "Not
 * scheduled" button. Filling in stays possible and stays out of the main flow.
 *
 * Precedence matters and is the whole reason this is a module rather than a
 * where-clause. A date-specific `schedule_exceptions` row wins outright over
 * the weekly pattern, in both directions:
 *
 *   exception, is_working = true   → working today even if the weekly
 *                                    pattern says otherwise (covering a shift)
 *   exception, is_working = false  → NOT working today even though the weekly
 *                                    pattern says they normally would be
 *                                    (approved time off)
 *   no exception                   → fall back to the weekly pattern
 *
 * Getting that backwards would put someone on approved leave at the top of the
 * list and bury the person actually covering for them.
 */
export interface ScheduleExceptionRow {
  location_staff_id: string;
  is_working: boolean;
}

export interface WeeklyShiftRow {
  location_staff_id: string;
}

/**
 * Set of location_staff_ids scheduled to work today.
 *
 * Callers must resolve "today" and its weekday in the LOCATION's timezone
 * (see common/time.ts) before querying the rows passed in — a UTC server
 * hosting a US shop otherwise reads the wrong calendar day, which has already
 * caused real customers to be turned away during opening hours.
 */
export function scheduledTodayStaffIds(
  exceptions: ScheduleExceptionRow[],
  weeklyShifts: WeeklyShiftRow[],
): Set<string> {
  const scheduled = new Set<string>();
  const decidedByException = new Set<string>();

  for (const exception of exceptions) {
    decidedByException.add(exception.location_staff_id);
    if (exception.is_working) scheduled.add(exception.location_staff_id);
  }

  for (const shift of weeklyShifts) {
    if (decidedByException.has(shift.location_staff_id)) continue;
    scheduled.add(shift.location_staff_id);
  }

  return scheduled;
}
