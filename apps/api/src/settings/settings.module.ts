import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OrgSettingsController } from './org-settings.controller';
import { OrgSettingsService } from './org-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController, OrgSettingsController],
  providers: [SettingsService, OrgSettingsService],
})
export class SettingsModule {}
