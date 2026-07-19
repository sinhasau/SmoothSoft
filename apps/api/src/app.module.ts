import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { PaymentsModule } from './payments/payments.module';
import { RlsTransactionMiddleware } from './common/rls-transaction.middleware';
import { HealthController, DebugController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    DatabaseModule,
    AuthModule,
    QueueModule,
    PaymentsModule,
  ],
  controllers: [HealthController, DebugController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RlsTransactionMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
