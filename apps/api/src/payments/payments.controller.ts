import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireAuth } from '../common/request-context';
import { PaymentsService } from './payments.service';
import type { CheckoutDto, CloseShopDto } from './payments.types';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('config')
  config() {
    const auth = requireAuth();
    return this.payments.getConfig(auth.locationId);
  }

  @Post('checkout')
  checkout(@Body() dto: CheckoutDto) {
    const auth = requireAuth();
    return this.payments.checkout(auth.locationId, auth.userId, dto);
  }

  @Get('close-shop-summary')
  closeShopSummary() {
    const auth = requireAuth();
    return this.payments.closeShopSummary(auth.locationId);
  }

  @Post('close-shop')
  closeShop(@Body() dto: CloseShopDto) {
    const auth = requireAuth();
    return this.payments.closeShop(auth.locationId, auth.userId, dto);
  }
}
