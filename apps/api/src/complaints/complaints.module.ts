import { Module } from '@nestjs/common';
import { ComplaintsController } from './complaints.controller';
import { PublicComplaintsController } from './public-complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  controllers: [ComplaintsController, PublicComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
