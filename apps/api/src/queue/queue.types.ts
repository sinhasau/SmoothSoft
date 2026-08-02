export interface CheckInDto {
  mode: 'phone' | 'guest';
  phone?: string;
  guestName?: string;
  /** Required when mode='phone' and no existing client matches (new-client intake, PRD §5.4). */
  newClientName?: string;
  referralSource?: string;
  allergyFlag?: boolean;
  /** Primary service; retained for backwards-compatible clients. */
  serviceId: string;
  /** Ordered services requested for this visit. The first is the primary service. */
  serviceIds?: string[];
  /** null/omitted = "Any available" (Next available). */
  requestedStaffId?: string | null;
  isAppointment: boolean;
  apptAt?: string;
  /** When true (or omitted for a guest walk-in), present=true and presentCheckedAt is set immediately. */
  present?: boolean;
  /** Set when the caller already confirmed a stale phone match is the same person (see client-lookup.ts). */
  confirmedStaleMatch?: boolean;
  /** Skips phone lookup/creation and uses this exact profile — for callers (the public multi-person picker) that already resolved which of several clients sharing a phone this is. */
  clientId?: string;
  /** Skips the ambiguous single-row phone lookup and always creates a new client from newClientName — for callers that already enumerated every existing profile on this phone and know this one is new. */
  forceNewClient?: boolean;
  /** Free-text note captured at sign-in (allergy callouts, "in a hurry", etc.) — stored on the same queue_entries.service_notes column the Start flow later appends to. */
  serviceNotes?: string;
}

export interface StartDto {
  staffId: string;
  serviceId?: string;
  serviceIds?: string[];
  serviceNotes?: string;
}

export interface ReorderDto {
  /** Full ordered list of waiting queue_entry ids, top to bottom. */
  orderedQueueEntryIds: string[];
}

export interface ReassignDto {
  newStaffId: string;
}

export interface ChangeServiceDto {
  serviceId: string;
  serviceIds?: string[];
}

export interface TogglePresentDto {
  present: boolean;
  /** Short disambiguation note (e.g. "blue jacket") — set when another waiting entry shares this client's display name. */
  identityNote?: string;
}

export interface ToggleReadyDto {
  ready: boolean;
}

export interface SetLateArrivalDto {
  /** True holds the entry out of the wait-time estimate; false returns it to the normal queue. */
  lateArrival: boolean;
}

export interface ReturnToWaitingDto {
  position: 'top' | 'original';
}

export interface SetStaffStatusDto {
  status: 'available' | 'break' | 'off';
}
