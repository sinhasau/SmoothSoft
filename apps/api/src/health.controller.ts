import { Controller, Get, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './db/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  check() {
    return { ok: true, service: 'salon-platform-api' };
  }

  // Neon's free-tier Postgres scales its compute to zero after 5 minutes of
  // no queries, independently of Render's own spin-down of this process —
  // pinging only GET /health above keeps the API process warm but does
  // nothing to keep the database warm, since it never touches the pool.
  // This route exists purely for the keep-alive workflow to hit instead.
  @Get('db')
  async checkDb() {
    await this.pool.query('SELECT 1');
    return { ok: true, service: 'salon-platform-api', db: true };
  }
}
