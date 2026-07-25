import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireFrontDeskOrManager } from '../common/request-context';
import { ComplaintsService } from './complaints.service';
import type { ComplaintStatus } from '../db/kysely.types';

/** Staff view of complaints — front desk + managers (the people who act on them). */
@Controller('complaints')
@UseGuards(AuthGuard)
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list() {
    const auth = requireFrontDeskOrManager();
    return this.complaints.list(auth.locationId);
  }

  @Post(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: ComplaintStatus) {
    const auth = requireFrontDeskOrManager();
    return this.complaints.updateStatus(auth.locationId, auth.userId, id, status);
  }
}
