export interface UpdateClientProfileDto {
  name?: string;
  phone?: string;
  notes?: string;
  allergyFlag?: boolean;
  referralSource?: string;
}

export interface CaptureConsentDto {
  consentType: string;
  version: string;
  accepted: boolean;
  notes?: string;
}

export interface RebookClientDto {
  locationId?: string;
  serviceId: string;
  serviceIds?: string[];
  locationStaffId?: string | null;
  startsAt: string;
  notes?: string;
}
