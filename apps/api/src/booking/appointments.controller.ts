import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireFrontDeskOrManager } from '../common/request-context';
import { QueueService } from '../queue/queue.service';
import { BookingService, StaffBookDto } from './booking.service';
import { AppointmentsService, RescheduleAppointmentDto } from './appointments.service';

@Controller('appointments')
@UseGuards(AuthGuard)
export class AppointmentsController {
  constructor(private readonly queue: QueueService, private readonly booking: BookingService, private readonly appointments: AppointmentsService) {}

  @Get()
  list() {
    const auth = requireAuth();
    return this.appointments.list(auth.locationId);
  }

  @Post()
  create(@Body() dto: StaffBookDto) {
    const auth = requireFrontDeskOrManager();
    return this.booking.createForStaff(auth.locationId, auth.userId, dto);
  }

  @Post(':id/check-in')
  checkIn(@Param('id') id: string) {
    const auth = requireAuth();
    return this.queue.checkInAppointment(auth.locationId, auth.userId, id);
  }

  @Patch(':id')
  reschedule(@Param('id') id: string, @Body() dto: RescheduleAppointmentDto) {
    const auth = requireFrontDeskOrManager();
    return this.appointments.reschedule(auth.locationId, id, dto);
  }

  @Post(':id/no-show')
  noShow(@Param('id') id: string) {
    const auth = requireFrontDeskOrManager();
    return this.appointments.noShow(auth.locationId, auth.userId, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    const auth = requireFrontDeskOrManager();
    return this.appointments.cancel(auth.locationId, auth.userId, id);
  }
}
