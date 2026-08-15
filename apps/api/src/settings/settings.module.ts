import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OrgLocationsController, OrgSettingsController, StaffContactController } from './org-settings.controller';
import { OrgSettingsService } from './org-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController, OrgSettingsController, StaffContactController, OrgLocationsController],
  providers: [SettingsService, OrgSettingsService],
})
export class SettingsModule {}
