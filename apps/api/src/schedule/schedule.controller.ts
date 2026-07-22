import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireManager } from '../common/request-context';
import { ScheduleService } from './schedule.service';
import type { DecideScheduleRequestDto, PublishScheduleDto, SubmitScheduleRequestDto } from './schedule.types';

@Controller('schedule')
@UseGuards(AuthGuard)
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('grid')
  grid(@Query('startDate') startDate: string, @Query('days') days?: string) {
    const auth = requireAuth();
    const start = startDate ?? new Date().toISOString().slice(0, 10);
    return this.schedule.grid(auth.locationId, start, days ? Number(days) : 14, auth.role === 'org_owner' || auth.role === 'location_manager');
  }

  @Get('requests')
  requests() {
    return this.schedule.pendingRequests(requireManager().locationId);
  }

  @Get('publication')
  publication(@Query('weekStart') weekStart: string) {
    return this.schedule.publication(requireAuth().locationId, weekStart);
  }

  @Post('publish')
  publish(@Body() dto: PublishScheduleDto) {
    const auth = requireManager();
    return this.schedule.publish(auth.locationId, auth.userId, dto);
  }

  @Post('requests')
  submit(@Body() dto: SubmitScheduleRequestDto) {
    const auth = requireAuth();
    return this.schedule.submitRequest(auth.locationId, auth.userId, dto);
  }

  @Post('requests/:id/approve')
  approve(@Param('id') id: string, @Body() dto: DecideScheduleRequestDto) {
    const auth = requireManager();
    return this.schedule.approveRequest(auth.locationId, id, auth.userId, dto);
  }

  @Post('requests/:id/deny')
  deny(@Param('id') id: string) {
    const auth = requireManager();
    return this.schedule.denyRequest(auth.locationId, id, auth.userId);
  }
}
