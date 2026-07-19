export interface CheckInDto {
  mode: 'phone' | 'guest';
  phone?: string;
  guestName?: string;
  /** Required when mode='phone' and no existing client matches (new-client intake, PRD §5.4). */
  newClientName?: string;
  referralSource?: string;
  allergyFlag?: boolean;
  serviceId: string;
  /** null/omitted = "Any available" (Next available). */
  requestedStaffId?: string | null;
  isAppointment: boolean;
  apptAt?: string;
  /** When true (or omitted for a guest walk-in), present=true and presentCheckedAt is set immediately. */
  present?: boolean;
  /** Set when the caller already confirmed a stale phone match is the same person (see client-lookup.ts). */
  confirmedStaleMatch?: boolean;
}

export interface StartDto {
  staffId: string;
  serviceNotes?: string;
}

export interface ReorderDto {
  /** Full ordered list of waiting queue_entry ids, top to bottom. */
  orderedQueueEntryIds: string[];
}

export interface ReassignDto {
  newStaffId: string;
}

export interface TogglePresentDto {
  present: boolean;
}

export interface ReturnToWaitingDto {
  position: 'top' | 'original';
}

export interface SetStaffStatusDto {
  status: 'available' | 'break' | 'off';
}
