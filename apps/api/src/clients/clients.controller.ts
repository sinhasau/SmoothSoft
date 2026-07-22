import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { ClientsService } from './clients.service';
import type { CaptureConsentDto, RebookClientDto, UpdateClientProfileDto } from './clients.types';

@Controller('clients')
@UseGuards(AuthGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  search(@Query('q') q?: string) {
    return this.clients.search(requireAuth().organizationId, q);
  }

  @Get(':id')
  profile(@Param('id') id: string) {
    return this.clients.getProfile(requireAuth().organizationId, id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientProfileDto) {
    return this.clients.updateProfile(requireAuth().organizationId, id, dto);
  }

  @Post(':id/consents')
  captureConsent(@Param('id') id: string, @Body() dto: CaptureConsentDto) {
    const auth = requireAuth();
    return this.clients.captureConsent(auth.organizationId, id, auth.userId, dto);
  }

  @Post(':id/rebook')
  rebook(@Param('id') id: string, @Body() dto: RebookClientDto) {
    const auth = requireAuth();
    return this.clients.rebook(auth.organizationId, auth.locationId, id, auth.userId, dto);
  }

  @Post(':id/appointments/:appointmentId/cancel')
  cancelAppointment(@Param('id') id: string, @Param('appointmentId') appointmentId: string) {
    const auth = requireAuth();
    return this.clients.cancelAppointment(auth.organizationId, auth.locationId, id, appointmentId);
  }
}
