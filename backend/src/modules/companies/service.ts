import { and, asc, eq, isNull } from 'drizzle-orm';
import { join } from 'node:path';
import { TAX_PRESETS, type CompanyRole } from '@im/shared/constants';
import type { companyCreateSchema, companyUpdateSchema } from '@im/shared/schemas';
import type { Company, CompanyMember, CompanySummary, CurrentUser } from '@im/shared/types';
import type { z } from 'zod';
import { transaction, type Connection } from '../../database/connection';
import { companies, currencies, taxes, userCompanyAccess, users } from '../../database/schema';
import { badRequest, notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { diff, recordAudit } from '../audit/service';
import { companyDir, decodeDataUrl, detectImage, storeFile } from '../files/service';
import { createDefaultSequences } from '../numbering/service';

type CompanyRow = typeof companies.$inferSelect;

export function toCompany(row: CompanyRow, role: CompanyRole): Company {
  const { logoFileId, ...rest } = row;
  return { ...rest, hasLogo: !!logoFileId, role };
}

function toSummary(row: CompanyRow, role: CompanyRole): CompanySummary {
  return {
    id: row.id,
    legalName: row.legalName,
    tradeName: row.tradeName,
    defaultCurrency: row.defaultCurrency,
    hasLogo: !!row.logoFileId,
    role,
    archivedAt: row.archivedAt,
  };
}

export function listCompaniesForUser(conn: Connection, user: CurrentUser): CompanySummary[] {
  if (user.role === 'owner') {
    return conn.db.select().from(companies).orderBy(asc(companies.legalName)).all().map((r) => toSummary(r, 'admin'));
  }
  return conn.db
    .select({ c: companies, role: userCompanyAccess.role })
    .from(userCompanyAccess)
    .innerJoin(companies, eq(companies.id, userCompanyAccess.companyId))
    .where(eq(userCompanyAccess.userId, user.id))
    .orderBy(asc(companies.legalName))
    .all()
    .map((r) => toSummary(r.c, r.role));
}

function assertActiveCurrency(conn: Connection, code: string) {
  const c = conn.db.select().from(currencies).where(eq(currencies.code, code)).get();
  if (!c || !c.isActive) throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue ou inactive : ${code}`);
}

export function getCompanyRow(conn: Connection, companyId: string): CompanyRow {
  const row = conn.db.select().from(companies).where(eq(companies.id, companyId)).get();
  if (!row) throw notFound('Entreprise');
  return row;
}

export function createCompany(conn: Connection, userId: string, input: z.output<typeof companyCreateSchema>): Company {
  const preset = TAX_PRESETS.find((p) => p.id === input.taxPreset);
  if (!preset) throw badRequest('UNKNOWN_TAX_PRESET', 'Préréglage fiscal inconnu');
  assertActiveCurrency(conn, input.defaultCurrency);
  const { taxPreset: _preset, ...data } = input;
  return transaction(conn, () => {
    const now = nowIso();
    const id = newId();
    conn.db.insert(companies).values({ ...data, id, createdAt: now, updatedAt: now }).run();
    conn.db.insert(userCompanyAccess).values({ userId, companyId: id, role: 'admin', createdAt: now }).run();
    createDefaultSequences(conn.db, id);
    preset.taxes.forEach((t, i) => {
      conn.db
        .insert(taxes)
        .values({ id: newId(), companyId: id, name: t.name, code: t.code, ratePpm: t.ratePpm, isCompound: false, isDefault: i === 0 || preset.id === 'ca-qc', createdAt: now, updatedAt: now })
        .run();
    });
    recordAudit(conn.db, { userId, companyId: id, action: 'create', entityType: 'company', entityId: id, summary: `Entreprise créée : ${data.legalName}` });
    return toCompany(getCompanyRow(conn, id), 'admin');
  });
}

export function updateCompany(
  conn: Connection,
  scope: { companyId: string; userId: string },
  role: CompanyRole,
  input: z.output<typeof companyUpdateSchema>,
): Company {
  if (input.defaultCurrency) assertActiveCurrency(conn, input.defaultCurrency);
  return transaction(conn, () => {
    const before = getCompanyRow(conn, scope.companyId);
    conn.db.update(companies).set({ ...input, updatedAt: nowIso() }).where(eq(companies.id, scope.companyId)).run();
    const after = getCompanyRow(conn, scope.companyId);
    const changes = diff(before as unknown as Record<string, unknown>, input as Record<string, unknown>);
    if (Object.keys(changes).length) {
      recordAudit(conn.db, { userId: scope.userId, companyId: scope.companyId, action: 'update', entityType: 'company', entityId: scope.companyId, summary: 'Entreprise modifiée', changes });
    }
    return toCompany(after, role);
  });
}

export function setCompanyArchived(conn: Connection, scope: { companyId: string; userId: string }, archived: boolean): void {
  transaction(conn, () => {
    getCompanyRow(conn, scope.companyId);
    conn.db.update(companies).set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() }).where(eq(companies.id, scope.companyId)).run();
    recordAudit(conn.db, { userId: scope.userId, companyId: scope.companyId, action: archived ? 'archive' : 'unarchive', entityType: 'company', entityId: scope.companyId, summary: archived ? 'Entreprise archivée' : 'Entreprise réactivée' });
  });
}

export function setCompanyLogo(
  conn: Connection,
  paths: { dataDir: string; documentsDir: string },
  scope: { companyId: string; userId: string },
  dataUrl: string | null,
): void {
  transaction(conn, () => {
    getCompanyRow(conn, scope.companyId);
    let fileId: string | null = null;
    if (dataUrl) {
      const buf = decodeDataUrl(dataUrl);
      const kind = detectImage(buf);
      if (!kind) throw badRequest('INVALID_IMAGE', 'Le fichier n’est pas une image PNG ou JPEG valide');
      const absPath = join(companyDir(paths.documentsDir, scope.companyId), 'logo', `${newId()}.${kind.ext}`);
      fileId = storeFile(conn.db, paths.dataDir, { companyId: scope.companyId, kind: 'logo', entityType: 'company', entityId: scope.companyId, absPath, mime: kind.mime, content: buf });
    }
    // Les anciens logos restent sur disque : ils peuvent figurer sur des PDF déjà émis.
    conn.db.update(companies).set({ logoFileId: fileId, updatedAt: nowIso() }).where(eq(companies.id, scope.companyId)).run();
    recordAudit(conn.db, { userId: scope.userId, companyId: scope.companyId, action: dataUrl ? 'logo_set' : 'logo_removed', entityType: 'company', entityId: scope.companyId, summary: dataUrl ? 'Logo mis à jour' : 'Logo retiré' });
  });
}

// ── Membres ──────────────────────────────────────────────────────────

export function listMembers(conn: Connection, companyId: string): CompanyMember[] {
  return conn.db
    .select({ userId: users.id, displayName: users.displayName, email: users.email, role: userCompanyAccess.role })
    .from(userCompanyAccess)
    .innerJoin(users, eq(users.id, userCompanyAccess.userId))
    .where(eq(userCompanyAccess.companyId, companyId))
    .orderBy(asc(users.displayName))
    .all();
}

export function setMember(conn: Connection, scope: { companyId: string; userId: string }, memberId: string, role: CompanyRole): void {
  transaction(conn, () => {
    const u = conn.db.select().from(users).where(eq(users.id, memberId)).get();
    if (!u) throw notFound('Utilisateur');
    conn.db
      .insert(userCompanyAccess)
      .values({ userId: memberId, companyId: scope.companyId, role, createdAt: nowIso() })
      .onConflictDoUpdate({ target: [userCompanyAccess.userId, userCompanyAccess.companyId], set: { role } })
      .run();
    recordAudit(conn.db, { userId: scope.userId, companyId: scope.companyId, action: 'member_set', entityType: 'user', entityId: memberId, summary: `Accès ${role} accordé à ${u.displayName}` });
  });
}

export function removeMember(conn: Connection, scope: { companyId: string; userId: string }, memberId: string): void {
  transaction(conn, () => {
    const r = conn.db
      .delete(userCompanyAccess)
      .where(and(eq(userCompanyAccess.companyId, scope.companyId), eq(userCompanyAccess.userId, memberId)))
      .run();
    if (r.changes === 0) throw notFound('Accès');
    recordAudit(conn.db, { userId: scope.userId, companyId: scope.companyId, action: 'member_removed', entityType: 'user', entityId: memberId, summary: 'Accès retiré' });
  });
}

export const activeCompanyFilter = isNull(companies.archivedAt);
