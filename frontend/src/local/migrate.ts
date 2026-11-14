/**
 * Migrations du schéma dans le navigateur. Les fichiers SQL sont exactement ceux du noyau
 * (backend/migrations) ; seul le module FTS5, absent de sql.js et inutilisé, est ignoré.
 */
import type { Database } from 'sql.js';
import journal from '@backend/../migrations/meta/_journal.json';
import { seedReferenceData } from '@backend/database/seed';
import { adapt } from './sqlite';

const files = import.meta.glob('@backend/../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const MIGRATION_COUNT = journal.entries.length;

export function appliedMigrations(db: Database): number {
  const t = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`);
  if (!t.length) return 0;
  return Number(db.exec('SELECT count(*) FROM __drizzle_migrations')[0]!.values[0]![0]);
}

export function migrate(db: Database): number {
  db.exec('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');
  const done = appliedMigrations(db);
  if (done > MIGRATION_COUNT) throw new Error('Ces données proviennent d’une version plus récente de l’application.');
  const pending = journal.entries.slice(done);
  for (const entry of pending) {
    const path = Object.keys(files).find((k) => k.endsWith(`/${entry.tag}.sql`));
    if (!path) throw new Error(`Migration introuvable : ${entry.tag}`);
    const statements = files[path]!.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    db.exec('BEGIN');
    try {
      for (const st of statements) {
        if (/USING\s+fts5/i.test(st)) continue;
        db.exec(st);
      }
      db.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [entry.tag, entry.when]);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  seedReferenceData(adapt(db), new Date().toISOString());
  return pending.length;
}
