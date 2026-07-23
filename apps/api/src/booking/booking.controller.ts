import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BookingService, PublicBookDto } from './booking.service';
import { QueueService } from '../queue/queue.service';

@Controller('public/locations/:locationId')
export class BookingController {
  constructor(private readonly booking: BookingService, private readonly queue: QueueService) {}
  @Get('booking') catalog(@Param('locationId') locationId: string) { return this.booking.catalog(locationId); }
  @Get('booking/slots') slots(@Param('locationId') locationId: string, @Query('serviceId') serviceId: string, @Query('serviceIds') serviceIds: string | undefined, @Query('date') date: string, @Query('locationStaffId') staff?: string) { return this.booking.slots(locationId, (serviceIds?.split(',').filter(Boolean).length ? serviceIds.split(',').filter(Boolean) : [serviceId]), date, staff); }
  @Post('booking') book(@Param('locationId') locationId: string, @Body() dto: PublicBookDto) { return this.booking.book(locationId, dto); }

  @Get('queue/snapshot') queueSnapshot(@Param('locationId') locationId: string) { return this.queue.publicSnapshot(locationId); }
  @Get('queue/last-service') lastService(@Param('locationId') locationId: string, @Query('phone') phone: string) { return this.queue.lastServiceForPhone(locationId, phone); }
  @Post('queue/join') queueJoin(@Param('locationId') locationId: string, @Body() dto: { phone: string; clientId?: string; name?: string; serviceId: string; serviceIds?: string[]; forceNewClient?: boolean }) { return this.queue.publicJoin(locationId, dto); }
  @Get('queue/status/:queueEntryId') queueStatus(@Param('locationId') locationId: string, @Param('queueEntryId') queueEntryId: string) { return this.queue.publicStatus(locationId, queueEntryId); }
}
