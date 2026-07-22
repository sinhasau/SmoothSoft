import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireFrontDeskOrManager } from '../common/request-context';
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
    const auth = requireAuth();
    // The org-wide dashboard spans every location's revenue, staff, and
    // compliance data — only the owner should see across locations at all.
    if (auth.role !== 'org_owner') {
      throw new ForbiddenException('Only the org owner can view the owner dashboard.');
    }
    return this.dashboard.orgDashboard(auth.organizationId);
  }
}
