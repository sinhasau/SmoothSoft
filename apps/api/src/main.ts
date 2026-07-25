import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  // Security headers (HSTS, X-Content-Type-Options, frameguard, etc.). CSP and
  // cross-origin-resource-policy are disabled: this is a JSON API consumed cross-origin
  // by the web app, and access is governed by the CORS config below.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`salon-platform-api listening on :${port}`);
}

bootstrap();
