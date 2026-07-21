import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { SettingsService } from './settings.service';
import type {
  AddStaffDto,
  ScheduleDayDto,
  StoreHoursDayDto,
  AddComplianceDocumentDto,
  UpdateComplianceDocumentDto,
  UpdateLocationGoalsDto,
  UpdatePaymentProcessorConfigDto,
  UpdatePricingPolicyDto,
  UpdateQueueConfigDto,
  UpdateSchedulingPolicyDto,
  UpdateStaffCompensationDto,
  UpdateStaffGoalsDto,
  UpdateStaffPriceTierDto,
  UpdateStaffSchedulingOverrideDto,
  UpdateTaxConfigDto,
  UpsertDiscountCodeDto,
  UpsertProductDto,
  UpsertServiceDto,
} from './settings.types';

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('store-hours')
  storeHours() {
    return this.settings.storeHours(requireAuth().locationId);
  }

  @Put('store-hours')
  setStoreHours(@Body() days: StoreHoursDayDto[]) {
    return this.settings.setStoreHours(requireAuth().locationId, days);
  }

  @Get('services')
  services() {
    return this.settings.services(requireAuth().locationId);
  }

  @Post('services')
  addService(@Body() dto: UpsertServiceDto) {
    return this.settings.addService(requireAuth().locationId, dto);
  }

  @Put('services/:id')
  updateService(@Param('id') id: string, @Body() dto: UpsertServiceDto) {
    return this.settings.updateService(requireAuth().locationId, id, dto);
  }

  @Delete('services/:id')
  removeService(@Param('id') id: string) {
    return this.settings.removeService(requireAuth().locationId, id);
  }

  @Get('products')
  products() {
    return this.settings.products(requireAuth().locationId);
  }

  @Post('products')
  addProduct(@Body() dto: UpsertProductDto) {
    return this.settings.addProduct(requireAuth().locationId, dto);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpsertProductDto) {
    return this.settings.updateProduct(requireAuth().locationId, id, dto);
  }

  @Delete('products/:id')
  removeProduct(@Param('id') id: string) {
    return this.settings.removeProduct(requireAuth().locationId, id);
  }

  @Get('tax-config')
  taxConfig() {
    return this.settings.taxConfig(requireAuth().locationId);
  }

  @Put('tax-config')
  setTaxConfig(@Body() dto: UpdateTaxConfigDto) {
    return this.settings.setTaxConfig(requireAuth().locationId, dto);
  }

  @Get('queue-config')
  queueConfig() {
    return this.settings.queueConfig(requireAuth().locationId);
  }

  @Put('queue-config')
  setQueueConfig(@Body() dto: UpdateQueueConfigDto) {
    return this.settings.setQueueConfig(requireAuth().locationId, dto);
  }

  @Get('location-goals')
  locationGoals() {
    return this.settings.locationGoals(requireAuth().locationId);
  }

  @Put('location-goals')
  setLocationGoals(@Body() dto: UpdateLocationGoalsDto) {
    return this.settings.setLocationGoals(requireAuth().locationId, dto);
  }

  @Get('payment-processor-config')
  paymentProcessorConfig() {
    return this.settings.paymentProcessorConfig(requireAuth().locationId);
  }

  @Put('payment-processor-config')
  setPaymentProcessorConfig(@Body() dto: UpdatePaymentProcessorConfigDto) {
    return this.settings.setPaymentProcessorConfig(requireAuth().locationId, dto);
  }

  @Get('staff')
  roster() {
    const auth = requireAuth();
    return this.settings.roster(auth.locationId, auth.role);
  }

  @Post('staff')
  addStaff(@Body() dto: AddStaffDto) {
    return this.settings.addStaff(requireAuth().locationId, dto);
  }

  @Put('staff/:id/compensation')
  updateCompensation(@Param('id') id: string, @Body() dto: UpdateStaffCompensationDto) {
    return this.settings.updateStaffCompensation(id, dto);
  }

  @Put('staff/:id/goals')
  updateGoals(@Param('id') id: string, @Body() dto: UpdateStaffGoalsDto) {
    return this.settings.updateStaffGoals(id, dto);
  }

  @Put('staff/:id/schedule')
  setSchedule(@Param('id') id: string, @Body() days: ScheduleDayDto[]) {
    return this.settings.setStaffSchedule(id, days);
  }

  @Get('discount-codes')
  discountCodes() {
    return this.settings.discountCodes(requireAuth().locationId);
  }

  @Post('discount-codes')
  addDiscountCode(@Body() dto: UpsertDiscountCodeDto) {
    return this.settings.addDiscountCode(requireAuth().locationId, dto);
  }

  @Put('discount-codes/:id')
  updateDiscountCode(@Param('id') id: string, @Body() dto: UpsertDiscountCodeDto) {
    return this.settings.updateDiscountCode(requireAuth().locationId, id, dto);
  }

  @Delete('discount-codes/:id')
  removeDiscountCode(@Param('id') id: string) {
    return this.settings.removeDiscountCode(requireAuth().locationId, id);
  }

  @Get('scheduling-policy')
  schedulingPolicy() {
    return this.settings.schedulingPolicy(requireAuth().locationId);
  }

  @Put('scheduling-policy')
  setSchedulingPolicy(@Body() dto: UpdateSchedulingPolicyDto) {
    return this.settings.setSchedulingPolicy(requireAuth().locationId, dto);
  }

  @Put('staff/:id/scheduling-override')
  setStaffSchedulingOverride(@Param('id') id: string, @Body() dto: UpdateStaffSchedulingOverrideDto) {
    return this.settings.setStaffSchedulingOverride(id, dto);
  }

  @Get('pricing-policy')
  pricingPolicy() {
    return this.settings.pricingPolicy(requireAuth().locationId);
  }

  @Put('pricing-policy')
  setPricingPolicy(@Body() dto: UpdatePricingPolicyDto) {
    return this.settings.setPricingPolicy(requireAuth().locationId, dto);
  }

  @Put('staff/:id/price-tier')
  setStaffPriceTier(@Param('id') id: string, @Body() dto: UpdateStaffPriceTierDto) {
    return this.settings.setStaffPriceTier(id, dto);
  }

  @Get('compliance-documents')
  complianceDocuments() {
    return this.settings.complianceDocuments(requireAuth().locationId);
  }

  @Put('compliance-documents/:id')
  updateComplianceDocument(@Param('id') id: string, @Body() dto: UpdateComplianceDocumentDto) {
    return this.settings.updateComplianceDocument(id, dto);
  }

  @Delete('compliance-documents/:id')
  removeComplianceDocument(@Param('id') id: string) {
    return this.settings.removeComplianceDocument(id);
  }

  @Post('staff/:id/compliance-documents')
  addStaffComplianceDocument(@Param('id') id: string, @Body() dto: AddComplianceDocumentDto) {
    return this.settings.addStaffComplianceDocument(requireAuth().locationId, id, dto);
  }
}
