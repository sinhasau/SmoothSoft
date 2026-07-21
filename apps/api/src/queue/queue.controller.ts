import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { QueueService } from './queue.service';
import type {
  ChangeServiceDto,
  CheckInDto,
  ReassignDto,
  ReorderDto,
  ReturnToWaitingDto,
  SetStaffStatusDto,
  StartDto,
  TogglePresentDto,
} from './queue.types';

@Controller()
@UseGuards(AuthGuard)
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get('queue/board')
  board() {
    const auth = requireAuth();
    return this.queue.getBoard(auth.locationId);
  }

  @Get('queue/activity')
  activity(@Query('limit') limit?: string) {
    const auth = requireAuth();
    return this.queue.activityLog(auth.locationId, limit ? Number(limit) : undefined);
  }

  @Post('queue/check-in')
  checkIn(@Body() dto: CheckInDto) {
    const auth = requireAuth();
    return this.queue.checkIn(auth.locationId, auth.organizationId, auth.userId, dto);
  }

  @Post('queue/:id/start')
  start(@Param('id') id: string, @Body() dto: StartDto) {
    const auth = requireAuth();
    return this.queue.start(auth.locationId, id, auth.userId, dto);
  }

  @Post('queue/:id/no-show')
  noShow(@Param('id') id: string) {
    const auth = requireAuth();
    return this.queue.noShow(auth.locationId, id, auth.userId);
  }

  @Post('queue/:id/cancel')
  cancel(@Param('id') id: string) {
    const auth = requireAuth();
    return this.queue.cancel(auth.locationId, id, auth.userId);
  }

  @Post('queue/:id/abandon')
  abandon(@Param('id') id: string) {
    const auth = requireAuth();
    return this.queue.abandon(auth.locationId, id, auth.userId);
  }

  @Post('queue/:id/reassign')
  reassign(@Param('id') id: string, @Body() dto: ReassignDto) {
    const auth = requireAuth();
    return this.queue.reassign(auth.locationId, id, auth.userId, dto);
  }

  @Get('queue/:id/eligible-staff')
  eligibleStaff(@Param('id') id: string) {
    const auth = requireAuth();
    return this.queue.eligibleStaff(auth.locationId, id);
  }

  @Post('queue/:id/service')
  changeService(@Param('id') id: string, @Body() dto: ChangeServiceDto) {
    const auth = requireAuth();
    return this.queue.changeService(auth.locationId, id, auth.userId, dto);
  }

  @Post('queue/reorder')
  reorder(@Body() dto: ReorderDto) {
    const auth = requireAuth();
    return this.queue.reorder(auth.locationId, auth.userId, dto);
  }

  @Post('queue/:id/present')
  present(@Param('id') id: string, @Body() dto: TogglePresentDto) {
    const auth = requireAuth();
    return this.queue.togglePresent(auth.locationId, id, auth.userId, dto);
  }

  @Post('queue/:id/return-to-waiting')
  returnToWaiting(@Param('id') id: string, @Body() dto: ReturnToWaitingDto) {
    const auth = requireAuth();
    return this.queue.returnToWaiting(auth.locationId, id, auth.userId, dto);
  }

  @Post('queue/undo/:eventId')
  undo(@Param('eventId') eventId: string) {
    const auth = requireAuth();
    return this.queue.undo(auth.locationId, eventId, auth.userId);
  }

  @Post('staff/:id/clock-in')
  clockIn(@Param('id') id: string) {
    const auth = requireAuth();
    return this.queue.clockIn(auth.locationId, id, auth.userId);
  }

  @Post('staff/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetStaffStatusDto) {
    const auth = requireAuth();
    return this.queue.setStaffStatus(auth.locationId, id, auth.userId, dto);
  }
}
