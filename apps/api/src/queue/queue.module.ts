import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { QueueGateway } from './queue.gateway';

@Module({
  imports: [AuthModule],
  controllers: [QueueController],
  providers: [QueueService, QueueGateway],
  exports: [QueueService, QueueGateway],
})
export class QueueModule {}
