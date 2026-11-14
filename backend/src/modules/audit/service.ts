import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { AuditEntry } from '@im/shared/types';
import type { DB } from '../../database/tx';
import { auditLog, users } from '../../database/schema';
import { newId, nowIso } from '../../utils/time';

export interface AuditInput {
  userId: string | null;
  companyId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, unknown> | null;
}

/** Ajoute une entrée au journal (append-only, protégé par trigger). À appeler dans la transaction métier. */
export function recordAudit(db: DB, e: AuditInput): void {
  db.insert(auditLog)
    .values({
      id: newId(),
      at: nowIso(),
      userId: e.userId,
      companyId: e.companyId ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      summary: e.summary,
      changes: e.changes ?? null,
    })
    .run();
}

/** Différence superficielle entre deux objets, pour journaliser les modifications. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (after[k] === undefined) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = { from: before[k], to: after[k] };
  }
  return out;
}

export function listAudit(db: DB, opts: { companyId?: string; limit?: number }): AuditEntry[] {
  const where: SQL[] = [];
  if (opts.companyId) where.push(eq(auditLog.companyId, opts.companyId));
  return db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      userName: users.displayName,
      companyId: auditLog.companyId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      summary: auditLog.summary,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(Math.min(opts.limit ?? 200, 1000))
    .all();
}
