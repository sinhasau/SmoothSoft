import { Controller, Delete, Get, NotFoundException, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { REPORT_IDS, ReportId, ReportsService } from './reports.service';

function assertReportId(reportId: string): ReportId {
  if (!(REPORT_IDS as readonly string[]).includes(reportId)) {
    throw new NotFoundException(`Unknown report: ${reportId}`);
  }
  return reportId as ReportId;
}

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('favorites')
  favorites() {
    return this.reports.getFavorites(requireAuth().locationStaffId);
  }

  @Put('favorites/:reportId')
  addFavorite(@Param('reportId') reportId: string) {
    return this.reports.addFavorite(requireAuth().locationStaffId, assertReportId(reportId));
  }

  @Delete('favorites/:reportId')
  removeFavorite(@Param('reportId') reportId: string) {
    return this.reports.removeFavorite(requireAuth().locationStaffId, assertReportId(reportId));
  }

  @Get(':reportId')
  run(@Param('reportId') reportId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.run(assertReportId(reportId), requireAuth().locationId, from, to);
  }
}
