import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import type {
  AddStaffDto,
  ScheduleDayDto,
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
  StoreHoursDayDto,
} from './settings.types';
import type { StaffRole } from '../db/kysely.types';

/** W2/1099 classification is payroll-sensitive — only management should see it about other staff. */
function canViewClassification(role: StaffRole): boolean {
  return role === 'org_owner' || role === 'location_manager';
}

/**
 * Module 2 (Shop Configuration) — CRUD over the config tables that drive
 * Module 1's live behavior (store hours gate appointment booking, services
 * feed the wait-time default duration, queue_config holds the algorithm
 * spec's configurables even though only location_default[service] is
 * actually wired into the calculation yet — see wait-time.ts).
 */
@Injectable()
export class SettingsService {
  // ---- Store hours ----
  storeHours(locationId: string) {
    return db().selectFrom('store_hours').selectAll().where('location_id', '=', locationId).orderBy('day_of_week').execute();
  }

  async setStoreHours(locationId: string, days: StoreHoursDayDto[]) {
    const trx = db();
    for (const day of days) {
      await trx
        .updateTable('store_hours')
        .set({ is_open: day.isOpen, open_time: day.openTime, close_time: day.closeTime })
        .where('location_id', '=', locationId)
        .where('day_of_week', '=', day.dayOfWeek)
        .execute();
    }
    return this.storeHours(locationId);
  }

  // ---- Services ----
  services(locationId: string) {
    return db().selectFrom('services').selectAll().where('location_id', '=', locationId).orderBy('name').execute();
  }

  addService(locationId: string, dto: UpsertServiceDto) {
    return db()
      .insertInto('services')
      .values({ location_id: locationId, name: dto.name, duration_minutes: dto.durationMinutes, price: dto.price, taxable: dto.taxable ?? false })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateService(locationId: string, id: string, dto: UpsertServiceDto) {
    const result = await db()
      .updateTable('services')
      .set({ name: dto.name, duration_minutes: dto.durationMinutes, price: dto.price, taxable: dto.taxable ?? false })
      .where('id', '=', id)
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Service not found');
    return result;
  }

  async removeService(locationId: string, id: string) {
    await db().deleteFrom('services').where('id', '=', id).where('location_id', '=', locationId).execute();
    return { ok: true };
  }

  // ---- Products ----
  products(locationId: string) {
    return db().selectFrom('products').selectAll().where('location_id', '=', locationId).orderBy('name').execute();
  }

  addProduct(locationId: string, dto: UpsertProductDto) {
    return db()
      .insertInto('products')
      .values({ location_id: locationId, name: dto.name, price: dto.price, stock_qty: dto.stockQty ?? 0 })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProduct(locationId: string, id: string, dto: UpsertProductDto) {
    const result = await db()
      .updateTable('products')
      .set({ name: dto.name, price: dto.price, stock_qty: dto.stockQty ?? 0 })
      .where('id', '=', id)
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Product not found');
    return result;
  }

  async removeProduct(locationId: string, id: string) {
    await db().deleteFrom('products').where('id', '=', id).where('location_id', '=', locationId).execute();
    return { ok: true };
  }

  // ---- Tax config ----
  taxConfig(locationId: string) {
    return db().selectFrom('tax_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
  }

  setTaxConfig(locationId: string, dto: UpdateTaxConfigDto) {
    return db()
      .updateTable('tax_config')
      .set({ retail_tax_pct: dto.retailTaxPct, services_taxable: dto.servicesTaxable })
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---- Queue config ----
  queueConfig(locationId: string) {
    return db().selectFrom('queue_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
  }

  async setQueueConfig(locationId: string, dto: UpdateQueueConfigDto) {
    const current = await this.queueConfig(locationId);
    if (!current) throw new NotFoundException('Queue config not found for this location');
    return db()
      .updateTable('queue_config')
      .set({
        cleanup_buffer_minutes: dto.cleanupBufferMinutes ?? current.cleanup_buffer_minutes,
        overrun_increment_minutes: dto.overrunIncrementMinutes ?? current.overrun_increment_minutes,
        long_shift_threshold_hours: dto.longShiftThresholdHours ?? current.long_shift_threshold_hours,
        long_shift_extra_minutes: dto.longShiftExtraMinutes ?? current.long_shift_extra_minutes,
        max_break_minutes: dto.maxBreakMinutes ?? current.max_break_minutes,
        appointment_max_wait_minutes: dto.appointmentMaxWaitMinutes ?? current.appointment_max_wait_minutes,
        appt_atrisk_notify_minutes: dto.apptAtriskNotifyMinutes ?? current.appt_atrisk_notify_minutes,
      })
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---- Location goals ----
  locationGoals(locationId: string) {
    return db().selectFrom('location_goals').selectAll().where('location_id', '=', locationId).executeTakeFirst();
  }

  async setLocationGoals(locationId: string, dto: UpdateLocationGoalsDto) {
    const current = await this.locationGoals(locationId);
    return db()
      .updateTable('location_goals')
      .set({
        daily_revenue_per_barber: dto.dailyRevenuePerBarber ?? current?.daily_revenue_per_barber ?? null,
        clients_per_day_per_barber: dto.clientsPerDayPerBarber ?? current?.clients_per_day_per_barber ?? null,
        tip_rate_pct: dto.tipRatePct ?? current?.tip_rate_pct ?? null,
        utilization_target_pct: dto.utilizationTargetPct ?? current?.utilization_target_pct ?? null,
      })
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---- Payment processor config ----
  paymentProcessorConfig(locationId: string) {
    return db().selectFrom('payment_processor_config').selectAll().where('location_id', '=', locationId).executeTakeFirst();
  }

  /**
   * Partial update: merges with the existing row rather than overwriting.
   * Earlier version null-ed out every omitted field, which meant a UI that
   * only wanted to change (say) the card fee silently wiped the Stripe
   * publishable key — every caller would have had to round-trip the full
   * config. Merge semantics let each Settings control PUT just its own field.
   */
  async setPaymentProcessorConfig(locationId: string, dto: UpdatePaymentProcessorConfigDto) {
    const current = await this.paymentProcessorConfig(locationId);
    if (!current) throw new NotFoundException('Payment processor config not found for this location');

    return db()
      .updateTable('payment_processor_config')
      .set({
        active_processor: dto.activeProcessor ?? current.active_processor,
        stripe_publishable_key: dto.stripePublishableKey !== undefined ? dto.stripePublishableKey : current.stripe_publishable_key,
        stripe_connected_account_id: dto.stripeConnectedAccountId !== undefined ? dto.stripeConnectedAccountId : current.stripe_connected_account_id,
        square_application_id: dto.squareApplicationId !== undefined ? dto.squareApplicationId : current.square_application_id,
        square_location_id: dto.squareLocationId !== undefined ? dto.squareLocationId : current.square_location_id,
        card_fee_pct: dto.cardFeePct ?? current.card_fee_pct,
        starting_cash_float: dto.startingCashFloat ?? current.starting_cash_float,
        show_discount_at_checkout: dto.showDiscountAtCheckout ?? current.show_discount_at_checkout,
        updated_at: new Date(),
      })
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---- Staff roster ----
  async roster(locationId: string, requesterRole: StaffRole) {
    const trx = db();
    const staff = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .select([
        'ls.id as locationStaffId',
        'u.full_name as fullName',
        'ls.role as role',
        'ls.classification as classification',
        'ls.status as status',
        'ls.scheduling_self_serve_override as schedulingSelfServeOverride',
        'ls.price_tier_amount as priceTierAmount',
      ])
      .where('ls.location_id', '=', locationId)
      .orderBy('u.full_name')
      .execute();

    const results = [];
    for (const person of staff) {
      const [comp, goals, schedule] = await Promise.all([
        trx
          .selectFrom('staff_compensation_history')
          .selectAll()
          .where('location_staff_id', '=', person.locationStaffId)
          .where('effective_to', 'is', null)
          .executeTakeFirst(),
        trx.selectFrom('staff_goals').selectAll().where('location_staff_id', '=', person.locationStaffId).executeTakeFirst(),
        trx
          .selectFrom('staff_schedule_days')
          .selectAll()
          .where('location_staff_id', '=', person.locationStaffId)
          .orderBy('day_of_week')
          .execute(),
      ]);
      results.push({ ...person, compensation: comp ?? null, goals: goals ?? null, schedule });
    }
    // W2/1099 classification is payroll-sensitive — only management sees it about other staff.
    return canViewClassification(requesterRole) ? results : results.map(({ classification, ...rest }) => rest);
  }

  async addStaff(locationId: string, dto: AddStaffDto) {
    const trx = db();

    const user = await trx.insertInto('users').values({ full_name: dto.fullName }).returningAll().executeTakeFirstOrThrow();

    const locationStaff = await trx
      .insertInto('location_staff')
      .values({ location_id: locationId, user_id: user.id, role: dto.role, classification: dto.classification, is_primary: true, status: 'off' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('staff_compensation_history')
      .values({
        location_staff_id: locationStaff.id,
        classification: dto.classification,
        commission_pct: dto.commissionPct ?? null,
        booth_rent_weekly: dto.boothRentWeekly ?? null,
      })
      .execute();

    await trx
      .insertInto('staff_goals')
      .values({ location_staff_id: locationStaff.id, daily_revenue: dto.dailyRevenueGoal ?? null, clients_per_day: dto.clientsPerDayGoal ?? null })
      .execute();

    if (dto.schedule && dto.schedule.length > 0) {
      await trx
        .insertInto('staff_schedule_days')
        .values(dto.schedule.map((s) => ({ location_staff_id: locationStaff.id, day_of_week: s.dayOfWeek, start_time: s.startTime, end_time: s.endTime })))
        .execute();
    }

    return locationStaff;
  }

  /**
   * Compensation history is effective-dated and immutable
   * (HANDOFF-master.md confirmed decision) — this never UPDATEs an
   * existing row. It closes out the current row (effective_to = now) and
   * inserts a new one, so recalculating a past pay period against the
   * OLD rate is still possible after a rate change.
   */
  async updateStaffCompensation(locationStaffId: string, dto: UpdateStaffCompensationDto) {
    const trx = db();
    const now = new Date();

    await trx
      .updateTable('staff_compensation_history')
      .set({ effective_to: now })
      .where('location_staff_id', '=', locationStaffId)
      .where('effective_to', 'is', null)
      .execute();

    return trx
      .insertInto('staff_compensation_history')
      .values({
        location_staff_id: locationStaffId,
        classification: dto.classification,
        commission_pct: dto.commissionPct ?? null,
        booth_rent_weekly: dto.boothRentWeekly ?? null,
        effective_from: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateStaffGoals(locationStaffId: string, dto: UpdateStaffGoalsDto) {
    const trx = db();
    const existing = await trx.selectFrom('staff_goals').selectAll().where('location_staff_id', '=', locationStaffId).executeTakeFirst();
    if (existing) {
      return trx
        .updateTable('staff_goals')
        .set({ daily_revenue: dto.dailyRevenue ?? existing.daily_revenue, clients_per_day: dto.clientsPerDay ?? existing.clients_per_day })
        .where('location_staff_id', '=', locationStaffId)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return trx
      .insertInto('staff_goals')
      .values({ location_staff_id: locationStaffId, daily_revenue: dto.dailyRevenue ?? null, clients_per_day: dto.clientsPerDay ?? null })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async setStaffSchedule(locationStaffId: string, days: ScheduleDayDto[]) {
    const trx = db();
    await trx.deleteFrom('staff_schedule_days').where('location_staff_id', '=', locationStaffId).execute();
    if (days.length > 0) {
      await trx
        .insertInto('staff_schedule_days')
        .values(days.map((d) => ({ location_staff_id: locationStaffId, day_of_week: d.dayOfWeek, start_time: d.startTime, end_time: d.endTime })))
        .execute();
    }
    return trx.selectFrom('staff_schedule_days').selectAll().where('location_staff_id', '=', locationStaffId).orderBy('day_of_week').execute();
  }

  // ---- Discount codes ----
  discountCodes(locationId: string) {
    return db().selectFrom('discount_codes').selectAll().where('location_id', '=', locationId).orderBy('created_at', 'desc').execute();
  }

  async addDiscountCode(locationId: string, dto: UpsertDiscountCodeDto) {
    if (dto.discountType === 'percent' && (dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('A percent discount must be between 0 and 100');
    }
    if (dto.value <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }
    const code = dto.code.trim().toUpperCase();
    const existing = await db()
      .selectFrom('discount_codes')
      .select('id')
      .where('location_id', '=', locationId)
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) {
      throw new BadRequestException(`Discount code "${code}" already exists for this location`);
    }

    return db()
      .insertInto('discount_codes')
      .values({
        location_id: locationId,
        code,
        discount_type: dto.discountType,
        value: dto.value,
        active: dto.active ?? true,
        expires_at: dto.expiresAt ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateDiscountCode(locationId: string, id: string, dto: UpsertDiscountCodeDto) {
    const result = await db()
      .updateTable('discount_codes')
      .set({
        code: dto.code.trim().toUpperCase(),
        discount_type: dto.discountType,
        value: dto.value,
        active: dto.active ?? true,
        expires_at: dto.expiresAt ?? null,
      })
      .where('id', '=', id)
      .where('location_id', '=', locationId)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Discount code not found');
    return result;
  }

  async removeDiscountCode(locationId: string, id: string) {
    await db().deleteFrom('discount_codes').where('id', '=', id).where('location_id', '=', locationId).execute();
    return { ok: true };
  }

  // ---- Scheduling policy (org/location default + per-staff exceptions) ----
  async schedulingPolicy(locationId: string) {
    const row = await db().selectFrom('location_scheduling_policy').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    return { selfServeDefault: row?.self_serve_default ?? false };
  }

  async setSchedulingPolicy(locationId: string, dto: UpdateSchedulingPolicyDto) {
    await db()
      .insertInto('location_scheduling_policy')
      .values({ location_id: locationId, self_serve_default: dto.selfServeDefault })
      .onConflict((oc) => oc.column('location_id').doUpdateSet({ self_serve_default: dto.selfServeDefault, updated_at: new Date() }))
      .execute();
    return this.schedulingPolicy(locationId);
  }

  async setStaffSchedulingOverride(locationStaffId: string, dto: UpdateStaffSchedulingOverrideDto) {
    const result = await db()
      .updateTable('location_staff')
      .set({ scheduling_self_serve_override: dto.selfServeOverride })
      .where('id', '=', locationStaffId)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Staff member not found');
    return result;
  }

  // ---- Barber-request pricing ----
  async pricingPolicy(locationId: string) {
    const row = await db().selectFrom('location_pricing_policy').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    return {
      barberRequestMode: row?.barber_request_mode ?? 'same',
      flatSurchargeAmount: Number(row?.flat_surcharge_amount ?? 0),
    };
  }

  async setPricingPolicy(locationId: string, dto: UpdatePricingPolicyDto) {
    await db()
      .insertInto('location_pricing_policy')
      .values({ location_id: locationId, barber_request_mode: dto.barberRequestMode, flat_surcharge_amount: dto.flatSurchargeAmount })
      .onConflict((oc) =>
        oc.column('location_id').doUpdateSet({ barber_request_mode: dto.barberRequestMode, flat_surcharge_amount: dto.flatSurchargeAmount, updated_at: new Date() }),
      )
      .execute();
    return this.pricingPolicy(locationId);
  }

  async setStaffPriceTier(locationStaffId: string, dto: UpdateStaffPriceTierDto) {
    const result = await db()
      .updateTable('location_staff')
      .set({ price_tier_amount: dto.priceTierAmount })
      .where('id', '=', locationStaffId)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Staff member not found');
    return result;
  }

  // ---- Compliance documents ----
  async complianceDocuments(locationId: string) {
    return db()
      .selectFrom('compliance_documents as cd')
      .leftJoin('location_staff as ls', 'ls.id', 'cd.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select([
        'cd.id as id',
        'cd.doc_type as docType',
        'cd.description as description',
        'cd.expires_at as expiresAt',
        'cd.status as status',
        'cd.location_staff_id as locationStaffId',
        'u.full_name as staffName',
      ])
      .where('cd.location_id', '=', locationId)
      .orderBy((eb) => eb.case().when('cd.status', '=', 'overdue').then(0).when('cd.status', '=', 'needs_attention').then(1).else(2).end())
      .execute();
  }

  async updateComplianceDocument(id: string, dto: UpdateComplianceDocumentDto) {
    const result = await db()
      .updateTable('compliance_documents')
      .set({
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.expiresAt !== undefined ? { expires_at: dto.expiresAt } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        last_updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new NotFoundException('Compliance document not found');
    return result;
  }

  /** Adds a document/license to a specific employee's profile (compensation history-style: staff detail page owns this, general Settings list just shows all of them). */
  async addStaffComplianceDocument(locationId: string, locationStaffId: string, dto: AddComplianceDocumentDto) {
    return db()
      .insertInto('compliance_documents')
      .values({
        location_id: locationId,
        location_staff_id: locationStaffId,
        doc_type: dto.docType,
        description: dto.description ?? null,
        expires_at: dto.expiresAt ?? null,
        status: dto.status ?? 'valid',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async removeComplianceDocument(id: string) {
    const result = await db().deleteFrom('compliance_documents').where('id', '=', id).returningAll().executeTakeFirst();
    if (!result) throw new NotFoundException('Compliance document not found');
    return result;
  }
}
