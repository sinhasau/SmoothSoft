/**
 * Must be the FIRST import in any entry point (main.ts, seed.ts,
 * seed-more-clients.ts) — before any other import that might construct a
 * `pg.Pool` at module-load time.
 *
 * Found the hard way: roster-bootstrap.ts builds its Pool from
 * `process.env.DATABASE_MIGRATE_URL` at import time (a deliberate
 * exception — see that file — to the "only construct pools inside a
 * factory" pattern). @nestjs/config's ConfigModule.forRoot() only loads
 * .env once Nest actually instantiates it, which happens *after* all of
 * main.ts's imports (including the whole AppModule -> AuthModule ->
 * roster-bootstrap.ts chain) have already executed. When this app is
 * started with a plain `npm run dev` (no shell that pre-sourced .env —
 * e.g. via this repo's .claude/launch.json), that left DATABASE_MIGRATE_URL
 * unset at the moment roster-bootstrap.ts's pool was constructed, and pg
 * silently fell back to connecting as the OS user to a same-named
 * database that doesn't exist ("database \"<user>\" does not exist").
 *
 * dotenv.config() only ever fills in variables not already set — it never
 * overrides a real environment variable, so this is safe alongside a shell
 * that already exported .env itself.
 */
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../.env') });
