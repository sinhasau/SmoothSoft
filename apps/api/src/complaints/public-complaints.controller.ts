import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ComplaintsService, SubmitComplaintDto } from './complaints.service';

/**
 * Public, unauthenticated complaint submission (the "customer flow" in). Tighter per-IP
 * limit than the global default, matching the other public endpoints (booking.controller.ts).
 * Shares the /public/locations/:locationId base with BookingController; Nest merges routes.
 */
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Controller('public/locations/:locationId')
export class PublicComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post('complaints')
  submit(@Param('locationId') locationId: string, @Body() dto: SubmitComplaintDto) {
    return this.complaints.submit(locationId, dto);
  }
}
