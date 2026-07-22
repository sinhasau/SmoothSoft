import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireManager } from '../common/request-context';
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

  @Get('staff-pay-runs/history')
  staffPayRuns() {
    return this.reports.getStaffPayRuns(requireManager().locationId);
  }

  @Post('staff-pay-runs')
  logStaffPayRun(@Body() body: { from: string; to: string; notes?: string }) {
    const auth = requireManager();
    return this.reports.logStaffPayRun(auth.locationId, auth.userId, body.from, body.to, body.notes);
  }

  @Get('staff-pay-runs/:id/export/:format')
  async exportLoggedStaffPayRun(@Param('id') id: string, @Param('format') rawFormat: string, @Res() res: Response) {
    if (rawFormat !== 'pdf' && rawFormat !== 'xlsx') throw new NotFoundException('Export format must be pdf or xlsx');
    const auth = requireManager();
    const { buffer, period } = await this.reports.exportLoggedStaffPayRun(auth.locationId, auth.userId, id, rawFormat);
    const filename = `logged-staff-pay-${period.from}-to-${period.to}.${rawFormat}`;
    res.setHeader('Content-Type', rawFormat === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('revenue_by_staff/export/:format')
  async exportStaffPay(
    @Param('format') rawFormat: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    if (rawFormat !== 'pdf' && rawFormat !== 'xlsx') throw new NotFoundException('Export format must be pdf or xlsx');
    const auth = requireManager();
    const { buffer, period } = await this.reports.exportStaffPayReport(auth.locationId, auth.userId, rawFormat, from, to);
    const filename = `staff-pay-${period.from}-to-${period.to}.${rawFormat}`;
    res.setHeader('Content-Type', rawFormat === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':reportId')
  run(@Param('reportId') reportId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.run(assertReportId(reportId), requireManager().locationId, from, to);
  }
}
