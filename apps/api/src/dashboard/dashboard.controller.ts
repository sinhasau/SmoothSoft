import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireFrontDeskOrManager, requireOwner } from '../common/request-context';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('location')
  location() {
    const auth = requireAuth();
    return this.dashboard.locationDashboard(auth.locationId, auth.role);
  }

  @Get('sales')
  sales(@Query('days') rawDays?: string) {
    const days = Math.min(90, Math.max(1, Number(rawDays ?? 1) || 1));
    return this.dashboard.salesBreakdown(requireFrontDeskOrManager().locationId, days);
  }

  @Get('org')
  org() {
    const auth = requireOwner();
    return this.dashboard.orgDashboard(auth.organizationId);
  }
}
