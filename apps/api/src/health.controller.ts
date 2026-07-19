import { Controller, Get, UseGuards } from '@nestjs/common';
import { db } from './common/request-context';
import { AuthGuard } from './auth/auth.guard';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { ok: true, service: 'salon-platform-api' };
  }
}

// TEMPORARY — verifies the request-scoped RLS-bound db() works end to end,
// and that AuthGuard correctly rejects unauthenticated requests before they
// ever reach a db() call (an unauthenticated request has no session vars
// set, which the RLS policies fail closed on with a raw Postgres error —
// the guard is what turns that into a clean 401 instead).
// Removed once the Settings module ships a real services endpoint.
@Controller('debug')
@UseGuards(AuthGuard)
export class DebugController {
  @Get('services')
  async services() {
    return db().selectFrom('services').selectAll().execute();
  }
}
