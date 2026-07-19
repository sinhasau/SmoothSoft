import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { ClientsService } from './clients.service';
import type { UpdateClientProfileDto } from './clients.types';

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
}
