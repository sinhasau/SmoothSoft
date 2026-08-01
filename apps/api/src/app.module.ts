import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { PaymentsModule } from './payments/payments.module';
import { SettingsModule } from './settings/settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ScheduleModule } from './schedule/schedule.module';
import { ClientsModule } from './clients/clients.module';
import { ReportsModule } from './reports/reports.module';
import { RlsTransactionMiddleware } from './common/rls-transaction.middleware';
import { HealthController } from './health.controller';
import { BookingModule } from './booking/booking.module';
import { ComplaintsModule } from './complaints/complaints.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    // Generous global rate limit (per-IP) so authenticated operator flows are unaffected;
    // public booking/queue routes tighten this with @Throttle. NOTE: default in-memory
    // storage is per-instance — swap to the Redis storage before running multiple API nodes.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    AuthModule,
    QueueModule,
    PaymentsModule,
    SettingsModule,
    DashboardModule,
    ScheduleModule,
    ClientsModule,
    ReportsModule,
    BookingModule,
    ComplaintsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RlsTransactionMiddleware)
      .exclude('health', 'health/(.*)')
      .forRoutes('*');
  }
}
