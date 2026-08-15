import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../common/request-context';
import type {
  AddStaffDto,
  AddPayModelDto,
  AddJobRoleDto,
  UpdateStaffTaxIdentityDto,
  UpdateStaffJobRoleDto,
  ScheduleDayDto,
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
  UpsertDiscountCodeDto,
  UpsertProductDto,
  UpsertServiceDto,
  StoreHoursDayDto,
  UpsertSpecialHoursDto,
} from './settings.types';
import type { StaffRole } from '../db/kysely.types';
import { rollingServiceAverages } from '../queue/service-performance';
import { COMPLIANCE_FILE_HELP, isAllowedComplianceFile } from './compliance-file.rules';
import { paySchedule } from './payroll-period';
import { encryptSsn, maskSsn, normalizeSsn } from '../security/staff-pii';
import { contactFor } from '../common/staff-contact-visibility';
import { rethrowIfSchemaBehind } from '../common/schema-readiness';

/** W2/1099 classification is payroll-sensitive — only management should see it about other staff. */
function canViewClassification(role: StaffRole): boolean {
  return role === 'org_owner' || role === 'location_manager';
}

function dateInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function startOfWeek(date: string, workweekStartsOn: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() - workweekStartsOn + 7) % 7));
  return value.toISOString().slice(0, 10);
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

  specialHours(locationId: string) {
    return db().selectFrom('location_special_hours').select(['id', 'special_date as date', 'label', 'is_closed as isClosed', 'open_time as openTime', 'close_time as closeTime']).where('location_id', '=', locationId).where('special_date', '>=', new Date().toISOString().slice(0, 10)).orderBy('special_date').execute();
  }

  async setSpecialHours(locationId: string, dto: UpsertSpecialHoursDto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) throw new BadRequestException('Date must be YYYY-MM-DD');
    if (!dto.isClosed && (!dto.openTime || !dto.closeTime || dto.openTime >= dto.closeTime)) throw new BadRequestException('Special opening and closing times are required and must be in order');
    await db().insertInto('location_special_hours').values({ location_id: locationId, special_date: dto.date, label: dto.label?.trim() || null, is_closed: dto.isClosed, open_time: dto.isClosed ? null : dto.openTime!, close_time: dto.isClosed ? null : dto.closeTime! }).onConflict((oc) => oc.columns(['location_id', 'special_date']).doUpdateSet({ label: dto.label?.trim() || null, is_closed: dto.isClosed, open_time: dto.isClosed ? null : dto.openTime!, close_time: dto.isClosed ? null : dto.closeTime!, updated_at: new Date() })).execute();
    return this.specialHours(locationId);
  }

  async removeSpecialHours(locationId: string, id: string) {
    const row = await db().deleteFrom('location_special_hours').where('id', '=', id).where('location_id', '=', locationId).returning('id').executeTakeFirst();
    if (!row) throw new NotFoundException('Special-hours entry not found');
    return { ok: true };
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

  /** Exactly one default service per location (migration 0049's partial unique index enforces
   *  this at the DB layer too) — clear the current one, then set the target, inside this
   *  request's transaction so the board is never briefly without or with two defaults. */
  async setDefaultService(locationId: string, id: string) {
    const trx = db();
    const target = await trx.selectFrom('services').select('id').where('id', '=', id).where('location_id', '=', locationId).executeTakeFirst();
    if (!target) throw new NotFoundException('Service not found');
    await trx.updateTable('services').set({ is_default: false }).where('location_id', '=', locationId).where('is_default', '=', true).execute();
    await trx.updateTable('services').set({ is_default: true }).where('id', '=', id).execute();
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

  async matchingPolicy(locationId: string) {
    const row = await db().selectFrom('queue_config').select('client_continuity_weight').where('location_id', '=', locationId).executeTakeFirst();
    if (!row) throw new NotFoundException('Queue config not found for this location');
    return { continuityWeight: row.client_continuity_weight };
  }

  async setMatchingPolicy(locationId: string, dto: UpdateMatchingPolicyDto) {
    if (!Number.isInteger(dto.continuityWeight) || dto.continuityWeight < 0 || dto.continuityWeight > 100) {
      throw new BadRequestException('Continuity weight must be a whole number between 0 and 100');
    }
    await db().updateTable('queue_config').set({ client_continuity_weight: dto.continuityWeight }).where('location_id', '=', locationId).executeTakeFirstOrThrow();
    return this.matchingPolicy(locationId);
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
  async roster(
    locationId: string,
    requesterRole: StaffRole,
    requesterStaffId?: string,
    /**
     * Who is asking, for the contact-details rule. Optional so existing callers
     * and tests keep working; when absent, contact is withheld from everyone
     * (fail closed — a caller that has not identified itself gets nothing).
     */
    viewer?: { userId: string; organizationId: string },
  ) {
    const trx = db();
    const staff = await trx
      .selectFrom('location_staff as ls')
      .innerJoin('users as u', 'u.id', 'ls.user_id')
      .leftJoin('location_job_roles as jr', 'jr.id', 'ls.job_role_id')
      .leftJoin('employee_tax_identities as eti', 'eti.location_staff_id', 'ls.id')
      .select([
        'ls.id as locationStaffId',
        'u.id as userId',
        'u.full_name as fullName',
        // RESTRICTED — see common/staff-contact-visibility.ts. Selected here but
        // only ever returned through contactFor() below.
        'u.phone as phone',
        'u.email as email',
        'u.address_line1 as addressLine1',
        'u.address_line2 as addressLine2',
        'u.city as city',
        'u.region as region',
        'u.postal_code as postalCode',
        'u.country as country',
        'u.emergency_contact_name as emergencyContactName',
        'u.emergency_contact_phone as emergencyContactPhone',
        'ls.role as role',
        'ls.classification as classification',
        'ls.status as status',
        'ls.employment_status as employmentStatus',
        'ls.scheduling_self_serve_override as schedulingSelfServeOverride',
        'ls.price_tier_amount as priceTierAmount',
        'jr.name as jobRoleName',
        'ls.job_role_id as jobRoleId',
        'eti.ssn_last_four as ssnLastFour',
      ])
      .where('ls.location_id', '=', locationId)
      .orderBy('u.full_name')
      .execute()
      .catch(rethrowIfSchemaBehind('The staff roster', '0054'));

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
      const {
        phone, email, addressLine1, addressLine2, city, region, postalCode, country,
        emergencyContactName, emergencyContactPhone, userId, ...rest
      } = person;
      // One rule, one place. Withheld returns null rather than a block of
      // nulls, so "not yours to read" is distinguishable from "not on file".
      const contact = viewer
        ? contactFor(
            { userId: viewer.userId, role: requesterRole, organizationId: viewer.organizationId, locationId },
            { userId, organizationId: viewer.organizationId, locationIds: [locationId] },
            { phone, email, addressLine1, addressLine2, city, region, postalCode, country, emergencyContactName, emergencyContactPhone },
          )
        : null;
      results.push({ ...rest, userId, contact, maskedSsn: person.ssnLastFour ? maskSsn(person.ssnLastFour) : null, ssnLastFour: undefined, compensation: comp ?? null, goals: goals ?? null, schedule });
    }
    if (canViewClassification(requesterRole)) return results;
    // Employees need names/statuses for daily operations and may inspect their
    // own profile, but must never receive another employee's pay, tax, goals,
    // or recurring schedule data merely by guessing a profile URL.
    return results.map((person) => {
      if (person.locationStaffId === requesterStaffId) return person;
      const { classification, maskedSsn, compensation, goals, schedule, schedulingSelfServeOverride, ...publicPerson } = person;
      return publicPerson;
    });
  }

  async staffServicePerformance(locationId: string, locationStaffId: string) {
    const timings = await db().selectFrom('queue_entries as qe').innerJoin('services as s', 's.id', 'qe.service_id').select([
      'qe.assigned_location_staff_id as staffId', 'qe.service_id as serviceId', 's.name as serviceName', 's.duration_minutes as serviceDefaultMinutes', 'qe.service_started_at as serviceStartedAt', 'qe.service_completed_at as serviceCompletedAt',
    ]).where('qe.location_id', '=', locationId).where('qe.assigned_location_staff_id', '=', locationStaffId).where('qe.status', '=', 'completed').where('qe.service_started_at', 'is not', null).where('qe.service_completed_at', 'is not', null).orderBy('qe.service_completed_at', 'desc').limit(500).execute();
    const averages = rollingServiceAverages(timings.map((row) => ({ staffId: row.staffId!, serviceId: row.serviceId!, serviceStartedAt: row.serviceStartedAt!, serviceCompletedAt: row.serviceCompletedAt! })));
    const serviceMeta = new Map(timings.map((row) => [row.serviceId!, { serviceName: row.serviceName, serviceDefaultMinutes: row.serviceDefaultMinutes }]));
    return averages.map((average) => ({ ...average, ...serviceMeta.get(average.serviceId), predictionReady: average.sampleCount >= 3 }));
  }

  async addStaff(locationId: string, dto: AddStaffDto) {
    const trx = db();

    if (!dto.fullName.trim()) throw new BadRequestException('Full name is required');
    let normalizedSsn: string | null = null;
    if (dto.socialSecurityNumber) {
      try { normalizedSsn = normalizeSsn(dto.socialSecurityNumber); } catch (error) { throw new BadRequestException((error as Error).message); }
    }
    const user = await trx.insertInto('users').values({ full_name: dto.fullName.trim(), email: dto.email?.trim() || null, phone: dto.phone?.trim() || null }).returningAll().executeTakeFirstOrThrow();

    const customPayModel = dto.customPayModelId ? await trx.selectFrom('location_pay_models').selectAll().where('id', '=', dto.customPayModelId).where('location_id', '=', locationId).where('active', '=', true).executeTakeFirst() : null;
    if (dto.customPayModelId && !customPayModel) throw new BadRequestException('The selected custom pay model is not available');
    if (dto.jobRoleId) {
      const jobRole = await trx.selectFrom('location_job_roles').selectAll().where('id', '=', dto.jobRoleId).where('location_id', '=', locationId).where('active', '=', true).executeTakeFirst();
      if (!jobRole) throw new BadRequestException('The selected job role is not available');
      dto.role = jobRole.permission_role;
    }
    const locationStaff = await trx
      .insertInto('location_staff')
      .values({ location_id: locationId, user_id: user.id, role: dto.role, job_role_id: dto.jobRoleId ?? null, classification: dto.classification, employment_status: dto.employmentStatus ?? 'active', hire_date: dto.hireDate ?? null, is_primary: true, status: 'off' })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (normalizedSsn) {
      await trx.insertInto('employee_tax_identities').values({ location_staff_id: locationStaff.id, ssn_ciphertext: encryptSsn(normalizedSsn, locationStaff.id), ssn_last_four: normalizedSsn.slice(-4) }).execute();
    }

    await trx
      .insertInto('staff_compensation_history')
      .values({
        location_staff_id: locationStaff.id,
        classification: dto.classification,
        commission_pct: dto.commissionPct ?? null,
        booth_rent_weekly: dto.boothRentWeekly ?? null,
        hourly_rate: dto.hourlyRate ?? null,
        annual_salary: dto.annualSalary ?? null,
        custom_pay_model_id: customPayModel?.id ?? null,
        custom_pay_model_name: customPayModel?.name ?? null,
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

    if (dto.complianceDocuments?.length) {
      await trx.insertInto('compliance_documents').values(dto.complianceDocuments.map((document) => ({ location_id: locationId, location_staff_id: locationStaff.id, doc_type: document.docType, description: document.description ?? null, issued_at: document.issuedAt ?? null, expires_at: document.expiresAt ?? null, status: document.status ?? 'valid' }))).execute();
    }

    return { ...locationStaff, fullName: user.full_name };
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

    const staff = await trx.selectFrom('location_staff').select(['location_id']).where('id', '=', locationStaffId).executeTakeFirstOrThrow();
    const customPayModel = dto.customPayModelId ? await trx.selectFrom('location_pay_models').selectAll().where('id', '=', dto.customPayModelId).where('location_id', '=', staff.location_id).where('active', '=', true).executeTakeFirst() : null;
    if (dto.customPayModelId && !customPayModel) throw new BadRequestException('The selected custom pay model is not available');
    return trx
      .insertInto('staff_compensation_history')
      .values({
        location_staff_id: locationStaffId,
        classification: dto.classification,
        commission_pct: dto.commissionPct ?? null,
        booth_rent_weekly: dto.boothRentWeekly ?? null,
        hourly_rate: dto.hourlyRate ?? null,
        annual_salary: dto.annualSalary ?? null,
        custom_pay_model_id: customPayModel?.id ?? null,
        custom_pay_model_name: customPayModel?.name ?? null,
        effective_from: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
      .catch((err) => {
        // uq_staff_comp_current (migration 0047) — a concurrent edit already opened a new current row.
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
          throw new ConflictException('This pay rate was just updated in another session. Reload and try again.');
        }
        throw err;
      });
  }

  async updateStaffTaxIdentity(locationId: string, locationStaffId: string, dto: UpdateStaffTaxIdentityDto) {
    const staff = await db().selectFrom('location_staff').select('id').where('id', '=', locationStaffId).where('location_id', '=', locationId).executeTakeFirst();
    if (!staff) throw new NotFoundException('Team member not found');
    let normalized: string;
    try { normalized = normalizeSsn(dto.socialSecurityNumber); } catch (error) { throw new BadRequestException((error as Error).message); }
    const encrypted = encryptSsn(normalized, locationStaffId);
    await db().insertInto('employee_tax_identities').values({ location_staff_id: locationStaffId, ssn_ciphertext: encrypted, ssn_last_four: normalized.slice(-4) }).onConflict((oc) => oc.column('location_staff_id').doUpdateSet({ ssn_ciphertext: encrypted, ssn_last_four: normalized.slice(-4), updated_at: new Date() })).execute();
    return { maskedSsn: maskSsn(normalized.slice(-4)) };
  }

  async updateStaffJobRole(locationId: string, locationStaffId: string, dto: UpdateStaffJobRoleDto) {
    let role = dto.role;
    if (dto.jobRoleId) {
      const jobRole = await db().selectFrom('location_job_roles').select('permission_role').where('id', '=', dto.jobRoleId).where('location_id', '=', locationId).where('active', '=', true).executeTakeFirst();
      if (!jobRole) throw new BadRequestException('The selected job role is not available');
      role = jobRole.permission_role;
    }
    const updated = await db().updateTable('location_staff').set({ role, job_role_id: dto.jobRoleId ?? null }).where('id', '=', locationStaffId).where('location_id', '=', locationId).returningAll().executeTakeFirst();
    if (!updated) throw new NotFoundException('Team member not found');
    return updated;
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
    return {
      selfServeDefault: row?.self_serve_default ?? false,
      overtimeThresholdHours: Number(row?.overtime_threshold_hours ?? 40),
      minimumCoverage: row?.minimum_coverage ?? 2,
      chairCount: row?.chair_count ?? 4,
      baseHourlyLaborCost: Number(row?.base_hourly_labor_cost ?? 24),
      payrollBurdenPct: Number(row?.payroll_burden_pct ?? 0),
    };
  }

  async setSchedulingPolicy(locationId: string, dto: UpdateSchedulingPolicyDto) {
    const current = await this.schedulingPolicy(locationId);
    const selfServeDefault = dto.selfServeDefault ?? current.selfServeDefault;
    const overtimeThresholdHours = dto.overtimeThresholdHours ?? current.overtimeThresholdHours;
    const minimumCoverage = dto.minimumCoverage ?? current.minimumCoverage;
    const chairCount = dto.chairCount ?? current.chairCount;
    const baseHourlyLaborCost = dto.baseHourlyLaborCost ?? current.baseHourlyLaborCost;
    const payrollBurdenPct = dto.payrollBurdenPct ?? current.payrollBurdenPct;
    if (overtimeThresholdHours <= 0 || overtimeThresholdHours > 168) throw new BadRequestException('Overtime threshold must be between 1 and 168 hours');
    if (minimumCoverage < 0 || minimumCoverage > 100) throw new BadRequestException('Minimum coverage must be between 0 and 100');
    if (chairCount <= 0 || chairCount > 500) throw new BadRequestException('Chair count must be between 1 and 500');
    if (baseHourlyLaborCost < 0 || baseHourlyLaborCost > 1000) throw new BadRequestException('Hourly labor cost must be between 0 and 1000');
    if (payrollBurdenPct < 0 || payrollBurdenPct > 100) throw new BadRequestException('Payroll burden must be between 0 and 100 percent');
    await db()
      .insertInto('location_scheduling_policy')
      .values({ location_id: locationId, self_serve_default: selfServeDefault, overtime_threshold_hours: overtimeThresholdHours, minimum_coverage: minimumCoverage, chair_count: chairCount, base_hourly_labor_cost: baseHourlyLaborCost, payroll_burden_pct: payrollBurdenPct })
      .onConflict((oc) => oc.column('location_id').doUpdateSet({ self_serve_default: selfServeDefault, overtime_threshold_hours: overtimeThresholdHours, minimum_coverage: minimumCoverage, chair_count: chairCount, base_hourly_labor_cost: baseHourlyLaborCost, payroll_burden_pct: payrollBurdenPct, updated_at: new Date() }))
      .execute();
    return this.schedulingPolicy(locationId);
  }

  async featureSettings(locationId: string) {
    const row = await db().selectFrom('location_feature_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    return { retailProductsEnabled: row?.retail_products_enabled ?? true, discountCodesEnabled: row?.discount_codes_enabled ?? true };
  }

  async setFeatureSettings(locationId: string, dto: UpdateFeatureSettingsDto) {
    const current = await this.featureSettings(locationId);
    const values = { retail_products_enabled: dto.retailProductsEnabled ?? current.retailProductsEnabled, discount_codes_enabled: dto.discountCodesEnabled ?? current.discountCodesEnabled };
    await db().insertInto('location_feature_settings').values({ location_id: locationId, ...values }).onConflict((oc) => oc.column('location_id').doUpdateSet({ ...values, updated_at: new Date() })).execute();
    return this.featureSettings(locationId);
  }

  async communicationSettings(locationId: string) {
    const row = await db().selectFrom('location_communication_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    return { enabled: row?.enabled ?? true, bookingConfirmations: row?.booking_confirmations ?? true, appointmentReminders: row?.appointment_reminders ?? true };
  }

  async setCommunicationSettings(locationId: string, dto: UpdateCommunicationSettingsDto) {
    const current = await this.communicationSettings(locationId);
    const values = { enabled: dto.enabled ?? current.enabled, booking_confirmations: dto.bookingConfirmations ?? current.bookingConfirmations, appointment_reminders: dto.appointmentReminders ?? current.appointmentReminders };
    await db().insertInto('location_communication_settings').values({ location_id: locationId, ...values }).onConflict((oc) => oc.column('location_id').doUpdateSet({ ...values, updated_at: new Date() })).execute();
    return this.communicationSettings(locationId);
  }

  async sanitationStatus(locationId: string) {
    const row = await db().selectFrom('location_sanitation_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    const latest = await db().selectFrom('sanitation_reminder_events').selectAll().where('location_id', '=', locationId).orderBy('acted_at', 'desc').executeTakeFirst();
    const lastCompleted = await db().selectFrom('sanitation_reminder_events').select('acted_at').where('location_id', '=', locationId).where('action', '=', 'completed').orderBy('acted_at', 'desc').executeTakeFirst();
    const enabled = row?.enabled ?? false;
    const intervalHours = row?.interval_hours ?? 2;
    const nextDueAt = row?.next_due_at ?? null;
    const due = enabled && !!nextDueAt && nextDueAt.getTime() <= Date.now();
    return {
      enabled,
      intervalHours,
      nextDueAt,
      due,
      snoozed: enabled && !due && latest?.action === 'snoozed' && latest.next_due_at.getTime() === nextDueAt?.getTime(),
      lastCompletedAt: lastCompleted?.acted_at ?? null,
    };
  }

  async setSanitationSettings(locationId: string, dto: UpdateSanitationSettingsDto) {
    const current = await this.sanitationStatus(locationId);
    const enabled = dto.enabled ?? current.enabled;
    const intervalHours = dto.intervalHours ?? current.intervalHours;
    if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 8) {
      throw new BadRequestException('Sanitation reminder interval must be between 1 and 8 hours');
    }
    const scheduleChanged = enabled && (!current.enabled || intervalHours !== current.intervalHours || !current.nextDueAt);
    const nextDueAt = enabled
      ? scheduleChanged ? new Date(Date.now() + intervalHours * 60 * 60 * 1000) : new Date(current.nextDueAt!)
      : null;
    await db().insertInto('location_sanitation_settings').values({ location_id: locationId, enabled, interval_hours: intervalHours, next_due_at: nextDueAt })
      .onConflict((oc) => oc.column('location_id').doUpdateSet({ enabled, interval_hours: intervalHours, next_due_at: nextDueAt, updated_at: new Date() })).execute();
    return this.sanitationStatus(locationId);
  }

  async snoozeSanitation(locationId: string, actorUserId: string) {
    const current = await this.sanitationStatus(locationId);
    if (!current.enabled) throw new BadRequestException('Sanitation reminders are disabled');
    const nextDueAt = new Date(Date.now() + 10 * 60 * 1000);
    await db().updateTable('location_sanitation_settings').set({ next_due_at: nextDueAt, updated_at: new Date() }).where('location_id', '=', locationId).execute();
    await db().insertInto('sanitation_reminder_events').values({ location_id: locationId, action: 'snoozed', scheduled_for: current.nextDueAt ? new Date(current.nextDueAt) : null, next_due_at: nextDueAt, actor_user_id: actorUserId }).execute();
    return this.sanitationStatus(locationId);
  }

  async completeSanitation(locationId: string, actorUserId: string) {
    const current = await this.sanitationStatus(locationId);
    if (!current.enabled) throw new BadRequestException('Sanitation reminders are disabled');
    const nextDueAt = new Date(Date.now() + current.intervalHours * 60 * 60 * 1000);
    await db().updateTable('location_sanitation_settings').set({ next_due_at: nextDueAt, updated_at: new Date() }).where('location_id', '=', locationId).execute();
    await db().insertInto('sanitation_reminder_events').values({ location_id: locationId, action: 'completed', scheduled_for: current.nextDueAt ? new Date(current.nextDueAt) : null, next_due_at: nextDueAt, actor_user_id: actorUserId }).execute();
    return this.sanitationStatus(locationId);
  }

  async payrollSettings(locationId: string) {
    const [row, location] = await Promise.all([db().selectFrom('location_payroll_settings').selectAll().where('location_id', '=', locationId).executeTakeFirst(), db().selectFrom('locations').select('timezone').where('id', '=', locationId).executeTakeFirstOrThrow()]);
    const frequency = row?.frequency ?? (row?.period_length_days === 7 ? 'weekly' : 'biweekly');
    const localToday = dateInTimezone(location.timezone);
    const workweekStartsOn = row?.workweek_starts_on ?? 0;
    const anchorDate = row?.anchor_date ?? startOfWeek(localToday, workweekStartsOn);
    const paydayOffsetBusinessDays = row?.payday_offset_business_days ?? row?.payday_offset_days ?? 5;
    return { scheduleName: row?.schedule_name ?? 'Primary pay schedule', frequency, anchorDate, workweekStartsOn, paydayOffsetBusinessDays, ...paySchedule(frequency, anchorDate, paydayOffsetBusinessDays, new Date(`${localToday}T12:00:00.000Z`)) };
  }

  async setPayrollSettings(locationId: string, dto: UpdatePayrollSettingsDto) {
    if (!dto.scheduleName?.trim()) throw new BadRequestException('Pay schedule name is required');
    if (!['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(dto.frequency)) throw new BadRequestException('Choose a valid pay frequency');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.anchorDate)) throw new BadRequestException('A valid pay-period start date is required');
    if (!Number.isInteger(dto.workweekStartsOn) || dto.workweekStartsOn < 0 || dto.workweekStartsOn > 6) throw new BadRequestException('Choose a valid workweek start day');
    if (!Number.isInteger(dto.paydayOffsetBusinessDays) || dto.paydayOffsetBusinessDays < 0 || dto.paydayOffsetBusinessDays > 10) throw new BadRequestException('Payday delay must be between 0 and 10 business days');
    const periodLengthDays = dto.frequency === 'weekly' ? 7 : 14;
    await db().insertInto('location_payroll_settings').values({ location_id: locationId, schedule_name: dto.scheduleName.trim(), frequency: dto.frequency, period_length_days: periodLengthDays, anchor_date: dto.anchorDate, workweek_starts_on: dto.workweekStartsOn, payday_offset_business_days: dto.paydayOffsetBusinessDays, payday_offset_days: dto.paydayOffsetBusinessDays }).onConflict((oc) => oc.column('location_id').doUpdateSet({ schedule_name: dto.scheduleName.trim(), frequency: dto.frequency, period_length_days: periodLengthDays, anchor_date: dto.anchorDate, workweek_starts_on: dto.workweekStartsOn, payday_offset_business_days: dto.paydayOffsetBusinessDays, payday_offset_days: dto.paydayOffsetBusinessDays, updated_at: new Date() })).execute();
    return this.payrollSettings(locationId);
  }

  payModels(locationId: string) {
    return db().selectFrom('location_pay_models').selectAll().where('location_id', '=', locationId).where('active', '=', true).orderBy('name').execute();
  }

  async addPayModel(locationId: string, dto: AddPayModelDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Pay model name is required');
    if (!['commission', 'booth_rent', 'hourly', 'salary'].includes(dto.calculationType)) throw new BadRequestException('Choose a valid calculation method');
    if (!Number.isFinite(dto.defaultAmount) || dto.defaultAmount < 0) throw new BadRequestException('Default amount must be zero or greater');
    return db().insertInto('location_pay_models').values({ location_id: locationId, name, calculation_type: dto.calculationType, default_amount: dto.defaultAmount }).returningAll().executeTakeFirstOrThrow();
  }

  async removePayModel(locationId: string, id: string) {
    const result = await db().updateTable('location_pay_models').set({ active: false }).where('location_id', '=', locationId).where('id', '=', id).returningAll().executeTakeFirst();
    if (!result) throw new NotFoundException('Pay model not found');
    return result;
  }

  jobRoles(locationId: string) {
    return db().selectFrom('location_job_roles').selectAll().where('location_id', '=', locationId).where('active', '=', true).orderBy('name').execute();
  }

  async addJobRole(locationId: string, dto: AddJobRoleDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Role name is required');
    if (!['location_manager', 'staff', 'front_desk'].includes(dto.permissionRole)) throw new BadRequestException('Choose a valid permission level');
    return db().insertInto('location_job_roles').values({ location_id: locationId, name, permission_role: dto.permissionRole }).returningAll().executeTakeFirstOrThrow();
  }

  async removeJobRole(locationId: string, id: string) {
    const result = await db().updateTable('location_job_roles').set({ active: false }).where('location_id', '=', locationId).where('id', '=', id).returningAll().executeTakeFirst();
    if (!result) throw new NotFoundException('Role not found');
    return result;
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

  async setStaffEmploymentStatus(locationStaffId: string, dto: UpdateStaffEmploymentStatusDto) {
    const result = await db().updateTable('location_staff').set({ employment_status: dto.employmentStatus, ...(dto.employmentStatus === 'active' ? {} : { status: 'off' as const }) }).where('id', '=', locationStaffId).returningAll().executeTakeFirst();
    if (!result) throw new NotFoundException('Staff member not found');
    return result;
  }

  // ---- Barber-request pricing ----
  async pricingPolicy(locationId: string) {
    const row = await db().selectFrom('location_pricing_policy').selectAll().where('location_id', '=', locationId).executeTakeFirst();
    return {
      barberRequestMode: row?.barber_request_mode ?? 'same',
      flatSurchargeAmount: Number(row?.flat_surcharge_amount ?? 0),
      creditSurchargeToStaff: row?.credit_surcharge_to_staff ?? true,
    };
  }

  async setPricingPolicy(locationId: string, dto: UpdatePricingPolicyDto) {
    await db()
      .insertInto('location_pricing_policy')
      .values({ location_id: locationId, barber_request_mode: dto.barberRequestMode, flat_surcharge_amount: dto.flatSurchargeAmount, credit_surcharge_to_staff: dto.creditSurchargeToStaff })
      .onConflict((oc) =>
        oc.column('location_id').doUpdateSet({ barber_request_mode: dto.barberRequestMode, flat_surcharge_amount: dto.flatSurchargeAmount, credit_surcharge_to_staff: dto.creditSurchargeToStaff, updated_at: new Date() }),
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
    const rows = await db()
      .selectFrom('compliance_documents as cd')
      .leftJoin('location_staff as ls', 'ls.id', 'cd.location_staff_id')
      .leftJoin('users as u', 'u.id', 'ls.user_id')
      .select([
        'cd.id as id',
        'cd.doc_type as docType',
        'cd.description as description',
        'cd.issued_at as issuedAt',
        'cd.expires_at as expiresAt',
        'cd.status as status',
        'cd.location_staff_id as locationStaffId',
        'u.full_name as staffName',
      ])
      .where('cd.location_id', '=', locationId)
      .orderBy((eb) => eb.case().when('cd.status', '=', 'overdue').then(0).when('cd.status', '=', 'needs_attention').then(1).else(2).end())
      .execute();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const attentionAt = new Date(today); attentionAt.setDate(attentionAt.getDate() + 30);
    return rows.map((row) => {
      if (!row.expiresAt) return row;
      const expiry = new Date(`${row.expiresAt}T00:00:00`);
      return { ...row, status: expiry < today ? 'overdue' as const : expiry <= attentionAt ? 'needs_attention' as const : 'valid' as const };
    });
  }

  async updateComplianceDocument(id: string, dto: UpdateComplianceDocumentDto) {
    const result = await db()
      .updateTable('compliance_documents')
      .set({
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.expiresAt !== undefined ? { expires_at: dto.expiresAt } : {}),
        ...(dto.issuedAt !== undefined ? { issued_at: dto.issuedAt } : {}),
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
        issued_at: dto.issuedAt ?? null,
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

  complianceDocumentFiles(documentId: string) {
    return db().selectFrom('compliance_document_files').select(['id', 'original_name as originalName', 'mime_type as mimeType', 'size_bytes as sizeBytes', 'uploaded_at as uploadedAt', 'uploaded_by_user_id as uploadedByUserId']).where('compliance_document_id', '=', documentId).orderBy('uploaded_at', 'desc').execute();
  }

  async addComplianceDocumentFile(locationId: string, documentId: string, actorUserId: string, file: Express.Multer.File) {
    const document = await db().selectFrom('compliance_documents').select('id').where('id', '=', documentId).where('location_id', '=', locationId).executeTakeFirst();
    if (!document) throw new NotFoundException('Compliance document not found');
    if (!isAllowedComplianceFile(file.originalname, file.mimetype)) throw new BadRequestException(`Upload a supported file: ${COMPLIANCE_FILE_HELP}`);
    return db().insertInto('compliance_document_files').values({ location_id: locationId, compliance_document_id: documentId, original_name: file.originalname, mime_type: file.mimetype, size_bytes: file.size, content: file.buffer, uploaded_by_user_id: actorUserId }).returning(['id', 'original_name as originalName', 'mime_type as mimeType', 'size_bytes as sizeBytes', 'uploaded_at as uploadedAt']).executeTakeFirstOrThrow();
  }

  async complianceDocumentFile(documentId: string, fileId: string) {
    const file = await db().selectFrom('compliance_document_files').selectAll().where('id', '=', fileId).where('compliance_document_id', '=', documentId).executeTakeFirst();
    if (!file) throw new NotFoundException('Attachment not found');
    return file;
  }
}
