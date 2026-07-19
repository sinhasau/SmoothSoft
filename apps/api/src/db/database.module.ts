import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { createAppPool } from './pool';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => createAppPool(),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor() {}

  async onModuleDestroy() {
    // individual Pool instances are closed by whichever module created them;
    // nothing to do here today, placeholder for when a graceful-shutdown
    // hook is wired up.
  }
}
