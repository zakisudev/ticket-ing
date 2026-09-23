import { migrate } from 'drizzle-orm/mysql2/migrator';
import { getDb, closePool } from './client.js';
import { getLogger } from '../lib/logger.js';

/**
 * Applies pending migrations from apps/api/drizzle.
 * Drizzle's migrator records applied migrations in __drizzle_migrations, making
 * repeated invocations no-ops — safe to run on every deploy/restart.
 */
export async function runMigrations(databaseUrl?: string): Promise<void> {
  const log = getLogger();
  const db = getDb(databaseUrl);
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  log.info('db.migrations.applied');
}

const isDirectRun = process.argv[1]?.includes('migrate');
if (isDirectRun) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      getLogger().error({ err }, 'db.migrations.failed');
      process.exit(1);
    });
}
