/** SQLite dans le navigateur (sql.js / WebAssembly), exposé avec l'API attendue par le noyau métier. */
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { imNorm, type SqliteLike } from '@backend/database/tx';

let SQL: SqlJsStatic | null = null;

export async function loadSqlJs(): Promise<SqlJsStatic> {
  SQL ??= await initSqlJs({ locateFile: () => wasmUrl });
  return SQL;
}

/** Réglages à réappliquer à chaque ouverture (et après un export, qui réinitialise la connexion). */
export function configure(db: Database): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.create_function('im_norm', (v: unknown) => imNorm(v) as SqlValue);
}

const norm = (params: unknown[]): SqlValue[] =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : (p as SqlValue)));

export function adapt(db: Database): SqliteLike {
  let depth = 0;
  const all = (sql: string, params: unknown[]) => {
    const st = db.prepare(sql);
    try {
      st.bind(norm(params));
      const rows: Record<string, unknown>[] = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally {
      st.free();
    }
  };
  return {
    prepare: (sql) => ({
      all: (...p) => all(sql, p),
      get: (...p) => all(sql, p)[0],
      run: (...p) => {
        db.run(sql, norm(p));
        return { changes: db.getRowsModified() };
      },
    }),
    exec: (sql) => void db.exec(sql),
    // Transactions imbriquées gérées par points de sauvegarde, comme better-sqlite3.
    transaction: (fn) => ({
      immediate: () => {
        const sp = `sp${depth}`;
        db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
        depth++;
        try {
          const r = fn();
          depth--;
          db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
          return r;
        } catch (e) {
          depth--;
          db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
          throw e;
        }
      },
    }),
    close: () => db.close(),
  };
}
