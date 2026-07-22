import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { db, requireFrontDeskOrManager } from '../common/request-context';

@Controller('communications')
@UseGuards(AuthGuard)
export class CommunicationsController {
  @Get()
  list() {
    const auth = requireFrontDeskOrManager();
    return db().selectFrom('communication_messages as cm').leftJoin('clients as c', 'c.id', 'cm.client_id').select(['cm.id', 'cm.channel', 'cm.message_type as messageType', 'cm.destination', 'cm.body', 'cm.status', 'cm.scheduled_for as scheduledFor', 'cm.sent_at as sentAt', 'cm.error_message as errorMessage', 'c.name as clientName']).where('cm.location_id', '=', auth.locationId).orderBy('cm.scheduled_for', 'desc').limit(100).execute();
  }
}
