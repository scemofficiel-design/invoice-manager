import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { searchAny } from '../../utils/search';
import { z } from 'zod';
import { catalogItemCreateSchema, catalogItemUpdateSchema } from '@im/shared/schemas';
import type { CatalogItem } from '@im/shared/types';
import { transaction, type DB } from '../../database/connection';
import { activities, catalogItemTaxes, catalogItems, currencies, taxes } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { badRequest, notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { diff, recordAudit } from '../audit/service';

type Row = typeof catalogItems.$inferSelect;

function toDto(db: DB, row: Row): CatalogItem {
  const { createdAt: _c, updatedAt: _u, ...r } = row;
  const taxIds = db.select({ id: catalogItemTaxes.taxId }).from(catalogItemTaxes).where(eq(catalogItemTaxes.catalogItemId, row.id)).all().map((t) => t.id);
  return { ...r, taxIds };
}

export function findItem(db: DB, companyId: string, id: string): Row {
  const row = db.select().from(catalogItems).where(and(eq(catalogItems.companyId, companyId), eq(catalogItems.id, id))).get();
  if (!row) throw notFound('Article');
  return row;
}

/** Vérifie que taxes, activité et devise existent pour cette entreprise (message clair avant la contrainte SQL). */
function validateRefs(db: DB, companyId: string, input: { taxIds?: string[] | undefined; activityId?: string | null | undefined; currency?: string | undefined }) {
  if (input.taxIds?.length) {
    const found = db.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.companyId, companyId), inArray(taxes.id, input.taxIds))).all();
    if (found.length !== new Set(input.taxIds).size) throw badRequest('INVALID_TAX', 'Taxe inconnue pour cette entreprise');
  }
  if (input.activityId && !db.select().from(activities).where(and(eq(activities.companyId, companyId), eq(activities.id, input.activityId))).get()) {
    throw badRequest('INVALID_ACTIVITY', 'Activité inconnue pour cette entreprise');
  }
  if (input.currency && !db.select().from(currencies).where(eq(currencies.code, input.currency)).get()) {
    throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue : ${input.currency}`);
  }
}

function setTaxes(db: DB, companyId: string, itemId: string, taxIds: string[]) {
  db.delete(catalogItemTaxes).where(eq(catalogItemTaxes.catalogItemId, itemId)).run();
  for (const taxId of new Set(taxIds)) db.insert(catalogItemTaxes).values({ companyId, catalogItemId: itemId, taxId }).run();
}

/**
 * Catalogue réutilisable. Les lignes de documents copient nom, prix et taxes : modifier un article
 * n'a aucun effet rétroactif sur les devis et factures existants.
 */
export async function catalogRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId/catalog';

  app.get(base, { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(200).optional(),
        kind: z.enum(['product', 'service']).optional(),
        activityId: z.string().max(64).optional(),
        currency: z.string().max(3).optional(),
        includeArchived: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
      }),
      req.query,
    );
    const conds: SQL[] = [eq(catalogItems.companyId, req.company!.id)];
    if (!q.includeArchived) conds.push(isNull(catalogItems.archivedAt));
    if (q.kind) conds.push(eq(catalogItems.kind, q.kind));
    if (q.activityId) conds.push(eq(catalogItems.activityId, q.activityId));
    if (q.currency) conds.push(eq(catalogItems.currency, q.currency));
    if (q.q) {
      conds.push(searchAny(q.q, [catalogItems.name, catalogItems.sku, catalogItems.category, catalogItems.description]));
    }
    return conn.db.select().from(catalogItems).where(and(...conds)).orderBy(asc(catalogItems.name)).limit(1000).all().map((r) => toDto(conn.db, r));
  });

  app.get(`${base}/:id`, { preHandler: companyAccess('viewer') }, async (req) => toDto(conn.db, findItem(conn.db, req.company!.id, (req.params as { id: string }).id)));

  app.post(base, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const { taxIds, ...input } = parse(catalogItemCreateSchema, req.body);
    const scope = scopeOf(req);
    validateRefs(conn.db, scope.companyId, { taxIds, activityId: input.activityId, currency: input.currency });
    const row = transaction(conn, () => {
      const now = nowIso();
      const id = newId();
      conn.db.insert(catalogItems).values({ ...input, id, companyId: scope.companyId, createdAt: now, updatedAt: now }).run();
      setTaxes(conn.db, scope.companyId, id, taxIds);
      recordAudit(conn.db, { ...scope, action: 'create', entityType: 'catalog_item', entityId: id, summary: `Article créé : ${input.name}` });
      return findItem(conn.db, scope.companyId, id);
    });
    return reply.code(201).send(toDto(conn.db, row));
  });

  app.patch(`${base}/:id`, { preHandler: companyAccess('editor') }, async (req) => {
    const { taxIds, ...input } = parse(catalogItemUpdateSchema, req.body);
    const scope = scopeOf(req);
    validateRefs(conn.db, scope.companyId, { taxIds, activityId: input.activityId, currency: input.currency });
    const row = transaction(conn, () => {
      const before = findItem(conn.db, scope.companyId, (req.params as { id: string }).id);
      conn.db.update(catalogItems).set({ ...input, updatedAt: nowIso() }).where(and(eq(catalogItems.companyId, scope.companyId), eq(catalogItems.id, before.id))).run();
      if (taxIds) setTaxes(conn.db, scope.companyId, before.id, taxIds);
      recordAudit(conn.db, { ...scope, action: 'update', entityType: 'catalog_item', entityId: before.id, summary: `Article modifié : ${before.name}`, changes: diff(before, { ...input, ...(taxIds ? { taxIds } : {}) }) });
      return findItem(conn.db, scope.companyId, before.id);
    });
    return toDto(conn.db, row);
  });

  for (const [path, archived] of [['archive', true], ['unarchive', false]] as const) {
    app.post(`${base}/:id/${path}`, { preHandler: companyAccess('editor') }, async (req) => {
      const scope = scopeOf(req);
      const row = transaction(conn, () => {
        const r = findItem(conn.db, scope.companyId, (req.params as { id: string }).id);
        conn.db.update(catalogItems).set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() }).where(and(eq(catalogItems.companyId, scope.companyId), eq(catalogItems.id, r.id))).run();
        recordAudit(conn.db, { ...scope, action: path, entityType: 'catalog_item', entityId: r.id, summary: `Article ${archived ? 'archivé' : 'réactivé'} : ${r.name}` });
        return findItem(conn.db, scope.companyId, r.id);
      });
      return toDto(conn.db, row);
    });
  }
}
