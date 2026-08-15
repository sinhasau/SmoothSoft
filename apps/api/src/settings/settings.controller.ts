import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireManager } from '../common/request-context';
import { SettingsService } from './settings.service';
import { MAX_COMPLIANCE_FILE_SIZE } from './compliance-file.rules';
import type {
  AddStaffDto,
  AddPayModelDto,
  AddJobRoleDto,
  UpdateStaffTaxIdentityDto,
  UpdateStaffJobRoleDto,
  ScheduleDayDto,
  StoreHoursDayDto,
  AddComplianceDocumentDto,
  UpdateComplianceDocumentDto,
  UpdateCommunicationSettingsDto,
  UpdateSanitationSettingsDto,
  UpdatePayrollSettingsDto,
  UpdateFeatureSettingsDto,
  UpdateLocationGoalsDto,
  UpdateMatchingPolicyDto,
  UpdatePaymentProcessorConfigDto,
  UpdatePricingPolicyDto,
  UpdateQueueConfigDto,
  UpdateSchedulingPolicyDto,
  UpdateStaffCompensationDto,
  UpdateStaffGoalsDto,
  UpdateStaffPriceTierDto,
  UpdateStaffSchedulingOverrideDto,
  UpdateStaffEmploymentStatusDto,
  UpdateTaxConfigDto,
  UpsertSpecialHoursDto,
  UpsertDiscountCodeDto,
  UpsertProductDto,
  UpsertServiceDto,
} from './settings.types';

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('feature-settings')
  featureSettings() {
    return this.settings.featureSettings(requireAuth().locationId);
  }

  @Put('feature-settings')
  setFeatureSettings(@Body() dto: UpdateFeatureSettingsDto) {
    requireManager();
    return this.settings.setFeatureSettings(requireAuth().locationId, dto);
  }

  @Get('store-hours')
  storeHours() {
    return this.settings.storeHours(requireAuth().locationId);
  }

  @Get('communication-settings')
  communicationSettings() {
    return this.settings.communicationSettings(requireAuth().locationId);
  }

  @Put('communication-settings')
  setCommunicationSettings(@Body() dto: UpdateCommunicationSettingsDto) {
    requireManager();
    return this.settings.setCommunicationSettings(requireAuth().locationId, dto);
  }

  @Get('sanitation-reminders')
  sanitationReminders() {
    return this.settings.sanitationStatus(requireAuth().locationId);
  }

  @Put('sanitation-reminders')
  setSanitationReminders(@Body() dto: UpdateSanitationSettingsDto) {
    requireManager();
    return this.settings.setSanitationSettings(requireAuth().locationId, dto);
  }

  @Post('sanitation-reminders/snooze')
  snoozeSanitationReminder() {
    const auth = requireAuth();
    return this.settings.snoozeSanitation(auth.locationId, auth.userId);
  }

  @Post('sanitation-reminders/complete')
  completeSanitationReminder() {
    const auth = requireAuth();
    return this.settings.completeSanitation(auth.locationId, auth.userId);
  }

  @Get('payroll-settings')
  payrollSettings() {
    requireManager();
    return this.settings.payrollSettings(requireAuth().locationId);
  }

  @Put('payroll-settings')
  setPayrollSettings(@Body() dto: UpdatePayrollSettingsDto) {
    requireManager();
    return this.settings.setPayrollSettings(requireAuth().locationId, dto);
  }

  @Get('pay-models')
  payModels() { requireManager(); return this.settings.payModels(requireAuth().locationId); }

  @Post('pay-models')
  addPayModel(@Body() dto: AddPayModelDto) { requireManager(); return this.settings.addPayModel(requireAuth().locationId, dto); }

  @Delete('pay-models/:id')
  removePayModel(@Param('id') id: string) { requireManager(); return this.settings.removePayModel(requireAuth().locationId, id); }

  @Get('job-roles')
  jobRoles() { requireManager(); return this.settings.jobRoles(requireAuth().locationId); }

  @Post('job-roles')
  addJobRole(@Body() dto: AddJobRoleDto) { requireManager(); return this.settings.addJobRole(requireAuth().locationId, dto); }

  @Delete('job-roles/:id')
  removeJobRole(@Param('id') id: string) { requireManager(); return this.settings.removeJobRole(requireAuth().locationId, id); }

  @Put('store-hours')
  setStoreHours(@Body() days: StoreHoursDayDto[]) {
    requireManager();
    return this.settings.setStoreHours(requireAuth().locationId, days);
  }

  @Get('special-hours')
  specialHours() {
    return this.settings.specialHours(requireAuth().locationId);
  }

  @Post('special-hours')
  setSpecialHours(@Body() dto: UpsertSpecialHoursDto) {
    requireManager();
    return this.settings.setSpecialHours(requireAuth().locationId, dto);
  }

  @Delete('special-hours/:id')
  removeSpecialHours(@Param('id') id: string) {
    requireManager();
    return this.settings.removeSpecialHours(requireAuth().locationId, id);
  }

  @Get('services')
  services() {
    return this.settings.services(requireAuth().locationId);
  }

  @Post('services')
  addService(@Body() dto: UpsertServiceDto) {
    requireManager();
    return this.settings.addService(requireAuth().locationId, dto);
  }

  @Put('services/:id')
  updateService(@Param('id') id: string, @Body() dto: UpsertServiceDto) {
    requireManager();
    return this.settings.updateService(requireAuth().locationId, id, dto);
  }

  @Delete('services/:id')
  removeService(@Param('id') id: string) {
    requireManager();
    return this.settings.removeService(requireAuth().locationId, id);
  }

  @Post('services/:id/set-default')
  setDefaultService(@Param('id') id: string) {
    requireManager();
    return this.settings.setDefaultService(requireAuth().locationId, id);
  }

  @Get('products')
  products() {
    return this.settings.products(requireAuth().locationId);
  }

  @Post('products')
  addProduct(@Body() dto: UpsertProductDto) {
    requireManager();
    return this.settings.addProduct(requireAuth().locationId, dto);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpsertProductDto) {
    requireManager();
    return this.settings.updateProduct(requireAuth().locationId, id, dto);
  }

  @Delete('products/:id')
  removeProduct(@Param('id') id: string) {
    requireManager();
    return this.settings.removeProduct(requireAuth().locationId, id);
  }

  @Get('tax-config')
  taxConfig() {
    return this.settings.taxConfig(requireAuth().locationId);
  }

  @Put('tax-config')
  setTaxConfig(@Body() dto: UpdateTaxConfigDto) {
    requireManager();
    return this.settings.setTaxConfig(requireAuth().locationId, dto);
  }

  @Get('queue-config')
  queueConfig() {
    return this.settings.queueConfig(requireAuth().locationId);
  }

  @Put('queue-config')
  setQueueConfig(@Body() dto: UpdateQueueConfigDto) {
    requireManager();
    return this.settings.setQueueConfig(requireAuth().locationId, dto);
  }

  @Get('matching-policy')
  matchingPolicy() {
    return this.settings.matchingPolicy(requireAuth().locationId);
  }

  @Put('matching-policy')
  setMatchingPolicy(@Body() dto: UpdateMatchingPolicyDto) {
    requireManager();
    return this.settings.setMatchingPolicy(requireAuth().locationId, dto);
  }

  @Get('location-goals')
  locationGoals() {
    return this.settings.locationGoals(requireAuth().locationId);
  }

  @Put('location-goals')
  setLocationGoals(@Body() dto: UpdateLocationGoalsDto) {
    requireManager();
    return this.settings.setLocationGoals(requireAuth().locationId, dto);
  }

  @Get('payment-processor-config')
  paymentProcessorConfig() {
    return this.settings.paymentProcessorConfig(requireAuth().locationId);
  }

  @Put('payment-processor-config')
  setPaymentProcessorConfig(@Body() dto: UpdatePaymentProcessorConfigDto) {
    requireManager();
    return this.settings.setPaymentProcessorConfig(requireAuth().locationId, dto);
  }

  @Get('staff')
  roster() {
    const auth = requireAuth();
    return this.settings.roster(auth.locationId, auth.role, auth.locationStaffId, { userId: auth.userId, organizationId: auth.organizationId });
  }

  @Get('staff/:id/service-performance')
  staffServicePerformance(@Param('id') id: string) {
    const auth = requireAuth();
    return this.settings.staffServicePerformance(auth.locationId, id);
  }

  @Post('staff')
  addStaff(@Body() dto: AddStaffDto) {
    requireManager();
    return this.settings.addStaff(requireAuth().locationId, dto);
  }

  @Put('staff/:id/compensation')
  updateCompensation(@Param('id') id: string, @Body() dto: UpdateStaffCompensationDto) {
    requireManager();
    return this.settings.updateStaffCompensation(id, dto);
  }

  @Put('staff/:id/tax-identity')
  updateTaxIdentity(@Param('id') id: string, @Body() dto: UpdateStaffTaxIdentityDto) {
    requireManager();
    return this.settings.updateStaffTaxIdentity(requireAuth().locationId, id, dto);
  }

  @Put('staff/:id/job-role')
  updateJobRole(@Param('id') id: string, @Body() dto: UpdateStaffJobRoleDto) {
    requireManager();
    return this.settings.updateStaffJobRole(requireAuth().locationId, id, dto);
  }

  @Put('staff/:id/goals')
  updateGoals(@Param('id') id: string, @Body() dto: UpdateStaffGoalsDto) {
    requireManager();
    return this.settings.updateStaffGoals(id, dto);
  }

  @Put('staff/:id/schedule')
  setSchedule(@Param('id') id: string, @Body() days: ScheduleDayDto[]) {
    requireManager();
    return this.settings.setStaffSchedule(id, days);
  }

  @Get('discount-codes')
  discountCodes() {
    return this.settings.discountCodes(requireAuth().locationId);
  }

  @Post('discount-codes')
  addDiscountCode(@Body() dto: UpsertDiscountCodeDto) {
    requireManager();
    return this.settings.addDiscountCode(requireAuth().locationId, dto);
  }

  @Put('discount-codes/:id')
  updateDiscountCode(@Param('id') id: string, @Body() dto: UpsertDiscountCodeDto) {
    requireManager();
    return this.settings.updateDiscountCode(requireAuth().locationId, id, dto);
  }

  @Delete('discount-codes/:id')
  removeDiscountCode(@Param('id') id: string) {
    requireManager();
    return this.settings.removeDiscountCode(requireAuth().locationId, id);
  }

  @Get('scheduling-policy')
  schedulingPolicy() {
    return this.settings.schedulingPolicy(requireAuth().locationId);
  }

  @Put('scheduling-policy')
  setSchedulingPolicy(@Body() dto: UpdateSchedulingPolicyDto) {
    requireManager();
    return this.settings.setSchedulingPolicy(requireAuth().locationId, dto);
  }

  @Put('staff/:id/scheduling-override')
  setStaffSchedulingOverride(@Param('id') id: string, @Body() dto: UpdateStaffSchedulingOverrideDto) {
    requireManager();
    return this.settings.setStaffSchedulingOverride(id, dto);
  }

  @Put('staff/:id/employment-status')
  setStaffEmploymentStatus(@Param('id') id: string, @Body() dto: UpdateStaffEmploymentStatusDto) {
    requireManager();
    return this.settings.setStaffEmploymentStatus(id, dto);
  }

  @Get('pricing-policy')
  pricingPolicy() {
    return this.settings.pricingPolicy(requireAuth().locationId);
  }

  @Put('pricing-policy')
  setPricingPolicy(@Body() dto: UpdatePricingPolicyDto) {
    requireManager();
    return this.settings.setPricingPolicy(requireAuth().locationId, dto);
  }

  @Put('staff/:id/price-tier')
  setStaffPriceTier(@Param('id') id: string, @Body() dto: UpdateStaffPriceTierDto) {
    requireManager();
    return this.settings.setStaffPriceTier(id, dto);
  }

  @Get('compliance-documents')
  complianceDocuments() {
    requireManager();
    return this.settings.complianceDocuments(requireAuth().locationId);
  }

  @Put('compliance-documents/:id')
  updateComplianceDocument(@Param('id') id: string, @Body() dto: UpdateComplianceDocumentDto) {
    requireManager();
    return this.settings.updateComplianceDocument(id, dto);
  }

  @Delete('compliance-documents/:id')
  removeComplianceDocument(@Param('id') id: string) {
    requireManager();
    return this.settings.removeComplianceDocument(id);
  }

  @Post('staff/:id/compliance-documents')
  addStaffComplianceDocument(@Param('id') id: string, @Body() dto: AddComplianceDocumentDto) {
    requireManager();
    return this.settings.addStaffComplianceDocument(requireAuth().locationId, id, dto);
  }

  @Get('compliance-documents/:id/files')
  complianceDocumentFiles(@Param('id') id: string) {
    requireManager();
    return this.settings.complianceDocumentFiles(id);
  }

  @Post('compliance-documents/:id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_COMPLIANCE_FILE_SIZE } }))
  uploadComplianceDocumentFile(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    const auth = requireManager();
    if (!file) throw new BadRequestException('Choose a file to upload');
    return this.settings.addComplianceDocumentFile(auth.locationId, id, auth.userId, file);
  }

  @Get('compliance-documents/:id/files/:fileId')
  async downloadComplianceDocumentFile(@Param('id') id: string, @Param('fileId') fileId: string, @Res() response: Response) {
    requireManager();
    const file = await this.settings.complianceDocumentFile(id, fileId);
    response.setHeader('Content-Type', file.mime_type);
    response.setHeader('Content-Disposition', `attachment; filename="${file.original_name.replace(/["\r\n]/g, '_')}"`);
    response.send(file.content);
  }

  @Get('compliance-documents/:id/files/:fileId/view')
  async viewComplianceDocumentFile(@Param('id') id: string, @Param('fileId') fileId: string, @Res() response: Response) {
    requireManager();
    const file = await this.settings.complianceDocumentFile(id, fileId);
    response.setHeader('Content-Type', file.mime_type);
    response.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/["\r\n]/g, '_')}"`);
    response.send(file.content);
  }
}
