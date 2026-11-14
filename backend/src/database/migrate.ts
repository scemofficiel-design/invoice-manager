import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Connection } from './tx';
import { seedReferenceData } from './seed';
import { nowIso } from '../utils/time';

/** Migrations côté Node (banc de test). L'application iPhone utilise son propre migrateur (frontend/src/local). */
export async function runMigrations(conn: Connection, opts: { migrationsDir: string }): Promise<void> {
  migrate(conn.db as unknown as BetterSQLite3Database, { migrationsFolder: opts.migrationsDir });
  seedReferenceData(conn.sqlite, nowIso());
}
