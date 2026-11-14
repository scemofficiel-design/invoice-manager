/**
 * Types et utilitaires de base de données indépendants de l'environnement d'exécution.
 * Le noyau métier ne dépend que de ce module : il fonctionne avec better-sqlite3 (Node, tests)
 * comme avec sql.js (application iPhone, dans le navigateur).
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

/** Sous-ensemble synchrone de l'API better-sqlite3, implémenté aussi au-dessus de sql.js. */
export interface SqliteLike {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): { immediate(): T };
  close(): void;
}

export type DB = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

export interface Connection {
  sqlite: SqliteLike;
  db: DB;
}

/** Exécute `fn` dans une transaction d'écriture (verrou pris dès le début). */
export function transaction<T>(conn: Connection, fn: () => T): T {
  return conn.sqlite.transaction(fn).immediate();
}

/** Normalisation de recherche : minuscules, sans accents (« Québec » ↔ « quebec »). */
export function imNorm(v: unknown): unknown {
  return typeof v === 'string' ? v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() : v;
}
