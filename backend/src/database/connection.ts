/** Connexion Node (better-sqlite3) — utilisée par le banc de test et les outils de développement. */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { imNorm, type Connection, type DB, type SqliteLike } from './tx';

export { transaction, type Connection, type DB, type SqliteLike } from './tx';
export type Sqlite = SqliteLike;

export function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('trusted_schema = OFF');
  sqlite.function('im_norm', { deterministic: true }, (v: unknown) => imNorm(v) as string);
}

export function openDatabase(path: string): Connection {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  applyPragmas(sqlite);
  return { sqlite: sqlite as unknown as SqliteLike, db: drizzle(sqlite, { schema }) as unknown as DB };
}
