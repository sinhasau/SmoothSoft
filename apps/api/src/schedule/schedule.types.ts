export interface SubmitScheduleRequestDto {
  locationStaffId: string;
  requestType: 'one_time' | 'recurring';
  workDate?: string;
  dayOfWeek?: number;
  isWorking: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface DecideScheduleRequestDto {
  /**
   * Recurring approvals require two explicit clicks with a warning shown
   * between them (HANDOFF-master.md confirmed decision: "recurring changes
   * require two explicit clicks and a warning"). The first call with
   * confirmed=false (or omitted) returns a 409 carrying the warning copy
   * instead of applying anything; the frontend shows that warning and
   * re-submits with confirmed=true. One-time requests apply on the first
   * call regardless of this flag.
   */
  confirmed?: boolean;
}
