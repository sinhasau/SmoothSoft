import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BookingService, PublicBookDto } from './booking.service';
import { AppointmentsService, RescheduleAppointmentDto } from './appointments.service';
import { QueueService } from '../queue/queue.service';

// Public, unauthenticated endpoints. Tighter per-IP limits than the global default blunt
// booking spam, phone-number enumeration, and brute-forcing of appointment/queue UUIDs.
// Rate mitigation only — verifying phone ownership (OTP) before revealing client identity
// is the real fix for last-service, tracked in docs/LAUNCH-READINESS-TRACKER.md (#16).
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller('public/locations/:locationId')
export class BookingController {
  constructor(private readonly booking: BookingService, private readonly queue: QueueService, private readonly appointments: AppointmentsService) {}
  @Get('booking') catalog(@Param('locationId') locationId: string) { return this.booking.catalog(locationId); }
  @Get('booking/slots') slots(@Param('locationId') locationId: string, @Query('serviceId') serviceId: string, @Query('serviceIds') serviceIds: string | undefined, @Query('date') date: string, @Query('locationStaffId') staff?: string) { return this.booking.slots(locationId, (serviceIds?.split(',').filter(Boolean).length ? serviceIds.split(',').filter(Boolean) : [serviceId]), date, staff); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('booking') book(@Param('locationId') locationId: string, @Body() dto: PublicBookDto) { return this.booking.book(locationId, dto); }

  // Customer self-service on their own appointment — authorized purely by the unguessable
  // appointment UUID in the booking link (same capability model as queue/status/:id).
  @Get('booking/:appointmentId/status') appointmentStatus(@Param('locationId') locationId: string, @Param('appointmentId') appointmentId: string) { return this.appointments.publicStatus(locationId, appointmentId); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('booking/:appointmentId/cancel') appointmentCancel(@Param('locationId') locationId: string, @Param('appointmentId') appointmentId: string) { return this.appointments.publicCancel(locationId, appointmentId); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('booking/:appointmentId/reschedule') appointmentReschedule(@Param('locationId') locationId: string, @Param('appointmentId') appointmentId: string, @Body() dto: RescheduleAppointmentDto) { return this.appointments.reschedule(locationId, appointmentId, dto); }

  @Get('queue/snapshot') queueSnapshot(@Param('locationId') locationId: string) { return this.queue.publicSnapshot(locationId); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('queue/last-service') lastService(@Param('locationId') locationId: string, @Query('phone') phone: string) { return this.queue.lastServiceForPhone(locationId, phone); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('queue/lookup') lookup(@Param('locationId') locationId: string, @Query('q') q: string) { return this.queue.lookupProfiles(locationId, q ?? ''); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('queue/join') queueJoin(@Param('locationId') locationId: string, @Body() dto: { phone: string; clientId?: string; name?: string; serviceId: string; serviceIds?: string[]; forceNewClient?: boolean }) { return this.queue.publicJoin(locationId, dto); }
  @Get('queue/status/:queueEntryId') queueStatus(@Param('locationId') locationId: string, @Param('queueEntryId') queueEntryId: string) { return this.queue.publicStatus(locationId, queueEntryId); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('queue/:queueEntryId/cancel') queueCancel(@Param('locationId') locationId: string, @Param('queueEntryId') queueEntryId: string) { return this.queue.publicCancel(locationId, queueEntryId); }
}
