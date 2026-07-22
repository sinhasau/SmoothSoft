import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BookingService, PublicBookDto } from './booking.service';

@Controller('public/locations/:locationId')
export class BookingController {
  constructor(private readonly booking: BookingService) {}
  @Get('booking') catalog(@Param('locationId') locationId: string) { return this.booking.catalog(locationId); }
  @Get('booking/slots') slots(@Param('locationId') locationId: string, @Query('serviceId') serviceId: string, @Query('serviceIds') serviceIds: string | undefined, @Query('date') date: string, @Query('locationStaffId') staff?: string) { return this.booking.slots(locationId, (serviceIds?.split(',').filter(Boolean).length ? serviceIds.split(',').filter(Boolean) : [serviceId]), date, staff); }
  @Post('booking') book(@Param('locationId') locationId: string, @Body() dto: PublicBookDto) { return this.booking.book(locationId, dto); }
}
