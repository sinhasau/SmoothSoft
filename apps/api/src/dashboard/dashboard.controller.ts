import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
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
  sales() {
    return this.dashboard.salesBreakdown(requireAuth().locationId);
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
