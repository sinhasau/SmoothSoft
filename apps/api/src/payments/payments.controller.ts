import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth, requireManager } from '../common/request-context';
import { PaymentsService } from './payments.service';
import type { CheckoutDto, CloseShopDto, OpenShopDto, RefundDto } from './payments.types';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('config')
  config() {
    const auth = requireAuth();
    return this.payments.getConfig(auth.locationId);
  }

  @Get('shop-status')
  shopStatus() {
    return this.payments.shopStatus(requireAuth().locationId);
  }

  @Post('checkout')
  checkout(@Body() dto: CheckoutDto) {
    const auth = requireAuth();
    return this.payments.checkout(auth.locationId, auth.userId, dto);
  }

  @Get('close-shop-summary')
  closeShopSummary() {
    const auth = requireManager();
    return this.payments.closeShopSummary(auth.locationId);
  }

  @Post('close-shop')
  closeShop(@Body() dto: CloseShopDto) {
    const auth = requireManager();
    return this.payments.closeShop(auth.locationId, auth.userId, dto);
  }

  @Get('open-shop-summary')
  openShopSummary() {
    return this.payments.openShopSummary(requireAuth().locationId);
  }

  @Post('open-shop')
  openShop(@Body() dto: OpenShopDto) {
    const auth = requireAuth();
    return this.payments.openShop(auth.locationId, auth.userId, dto);
  }

  @Post('transactions/:id/refund')
  refund(@Param('id') id: string, @Body() dto: RefundDto) {
    const auth = requireManager();
    return this.payments.refund(auth.locationId, auth.userId, id, dto);
  }
}
