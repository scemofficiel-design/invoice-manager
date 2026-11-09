import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;
export type Sqlite = Database.Database;

export interface Connection {
  sqlite: Sqlite;
  db: DB;
}

export function applyPragmas(sqlite: Sqlite): void {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('trusted_schema = OFF');
  // Normalisation pour la recherche : minuscules, sans accents (« Québec » ↔ « quebec »).
  sqlite.function('im_norm', { deterministic: true }, (v: unknown) =>
    typeof v === 'string' ? v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() : v,
  );
}

export function openDatabase(path: string): Connection {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  applyPragmas(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Exécute `fn` dans une transaction SQLite immédiate (verrou d'écriture pris dès le début). */
export function transaction<T>(conn: Connection, fn: () => T): T {
  return conn.sqlite.transaction(fn).immediate();
}
