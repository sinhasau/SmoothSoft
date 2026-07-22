import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { BookingModule } from '../booking/booking.module';

@Module({
  imports: [AuthModule, BookingModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
