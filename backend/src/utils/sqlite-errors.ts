import { AppError } from './errors';

/**
 * Traduit une erreur SQLite (contrainte, trigger) en erreur HTTP compréhensible.
 * better-sqlite3 fournit un `code` ; sql.js ne fournit que le message : les deux sont gérés.
 */
export function mapSqliteError(err: unknown): AppError | null {
  if (!(err instanceof Error)) return null;
  const code = (err as Error & { code?: string }).code ?? '';
  const msg = err.message;
  const trigger = /^([A-Z_]{3,}): (.+)$/.exec(msg);
  if (trigger && (code === 'SQLITE_CONSTRAINT_TRIGGER' || !code)) return new AppError(409, trigger[1]!, trigger[2]!);
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || /UNIQUE constraint failed/.test(msg)) {
    return new AppError(409, 'CONFLICT', 'Cette valeur existe déjà (doublon)');
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint failed/.test(msg)) {
    return new AppError(400, 'INVALID_REFERENCE', 'Référence invalide ou appartenant à une autre entreprise');
  }
  if (code === 'SQLITE_CONSTRAINT_CHECK' || /CHECK constraint failed/.test(msg)) return new AppError(400, 'CONSTRAINT_VIOLATION', 'Valeur non autorisée');
  return null;
}
