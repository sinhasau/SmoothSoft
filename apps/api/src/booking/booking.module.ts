import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { CommunicationsController } from './communications.controller';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { QueueModule } from '../queue/queue.module';
@Module({ imports: [QueueModule], controllers: [BookingController, CommunicationsController, AppointmentsController], providers: [BookingService, AppointmentsService], exports: [BookingService] })
export class BookingModule {}
