import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_CURRENCIES } from '@im/shared/constants';
import type { Connection } from './connection';
import { createBackup } from '../modules/backup/service';
import { nowIso } from '../utils/time';

interface Journal {
  entries: { idx: number; tag: string }[];
}

function appliedCount(conn: Connection): number {
  const exists = conn.sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
    .get();
  if (!exists) return 0;
  return (conn.sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
}

/**
 * Applique les migrations en attente. Si la base contient déjà des données, une sauvegarde
 * « pre-migration » est réalisée d'abord (ARCHITECTURE.md §9.2).
 */
export async function runMigrations(
  conn: Connection,
  opts: { migrationsDir: string; backupsDir: string | null; appVersion: string },
): Promise<{ applied: number }> {
  const journal = JSON.parse(readFileSync(join(opts.migrationsDir, 'meta', '_journal.json'), 'utf8')) as Journal;
  const before = appliedCount(conn);
  const pending = journal.entries.length - before;
  if (pending < 0) {
    throw new Error(
      'La base de données provient d’une version plus récente de l’application. Mettez l’application à jour.',
    );
  }
  if (pending > 0 && before > 0 && opts.backupsDir) {
    await createBackup(conn.sqlite, opts.backupsDir, { reason: 'pre-migration', appVersion: opts.appVersion });
  }
  if (pending > 0) migrate(conn.db, { migrationsFolder: opts.migrationsDir });
  seedReferenceData(conn);
  return { applied: pending };
}

/** Données de référence idempotentes (jamais de données métier ici). */
function seedReferenceData(conn: Connection): void {
  const insert = conn.sqlite.prepare(
    'INSERT OR IGNORE INTO currencies (code, name, symbol, minor_units, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
  );
  const now = nowIso();
  conn.sqlite.transaction(() => {
    for (const c of SEED_CURRENCIES) insert.run(c.code, c.name, c.symbol, c.minorUnits, now);
  })();
}
