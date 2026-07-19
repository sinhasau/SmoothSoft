import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('location')
  location() {
    return this.dashboard.locationDashboard(requireAuth().locationId);
  }

  @Get('org')
  org() {
    return this.dashboard.orgDashboard(requireAuth().organizationId);
  }
}
