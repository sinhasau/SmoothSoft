import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
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
