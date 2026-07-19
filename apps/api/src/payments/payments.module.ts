import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
