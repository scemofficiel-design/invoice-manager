import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { listQuerySchema, taxCreateSchema, taxUpdateSchema } from '@im/shared/schemas';
import type { Tax } from '@im/shared/types';
import { transaction } from '../../database/tx';
import { taxes } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { diff, recordAudit } from '../audit/service';

const toDto = ({ createdAt: _c, updatedAt: _u, ...r }: typeof taxes.$inferSelect): Tax => r;

/**
 * Taxes configurables par entreprise. Modifier un taux n'affecte jamais un document existant :
 * les documents conservent une copie (snapshot) des taxes appliquées.
 */
export async function taxRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId/taxes';
  const findScoped = (companyId: string, id: string) => {
    const row = conn.db.select().from(taxes).where(and(eq(taxes.companyId, companyId), eq(taxes.id, id))).get();
    if (!row) throw notFound('Taxe');
    return row;
  };

  app.get(base, { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(listQuerySchema, req.query);
    const conds = [eq(taxes.companyId, req.company!.id)];
    if (!q.includeArchived) conds.push(isNull(taxes.archivedAt));
    return conn.db.select().from(taxes).where(and(...conds)).orderBy(asc(taxes.name)).all().map(toDto);
  });

  app.post(base, { preHandler: companyAccess('admin') }, async (req, reply) => {
    const input = parse(taxCreateSchema, req.body);
    const scope = scopeOf(req);
    const row = transaction(conn, () => {
      const now = nowIso();
      const id = newId();
      conn.db.insert(taxes).values({ ...input, id, companyId: scope.companyId, createdAt: now, updatedAt: now }).run();
      recordAudit(conn.db, { ...scope, action: 'create', entityType: 'tax', entityId: id, summary: `Taxe créée : ${input.name}` });
      return findScoped(scope.companyId, id);
    });
    return reply.code(201).send(toDto(row));
  });

  app.patch(`${base}/:id`, { preHandler: companyAccess('admin') }, async (req) => {
    const input = parse(taxUpdateSchema, req.body);
    const scope = scopeOf(req);
    return toDto(
      transaction(conn, () => {
        const before = findScoped(scope.companyId, (req.params as { id: string }).id);
        conn.db.update(taxes).set({ ...input, updatedAt: nowIso() }).where(and(eq(taxes.companyId, scope.companyId), eq(taxes.id, before.id))).run();
        recordAudit(conn.db, { ...scope, action: 'update', entityType: 'tax', entityId: before.id, summary: `Taxe modifiée : ${before.name}`, changes: diff(before, input) });
        return findScoped(scope.companyId, before.id);
      }),
    );
  });

  for (const [path, archived] of [['archive', true], ['unarchive', false]] as const) {
    app.post(`${base}/:id/${path}`, { preHandler: companyAccess('admin') }, async (req) => {
      const scope = scopeOf(req);
      return toDto(
        transaction(conn, () => {
          const row = findScoped(scope.companyId, (req.params as { id: string }).id);
          conn.db.update(taxes).set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() }).where(and(eq(taxes.companyId, scope.companyId), eq(taxes.id, row.id))).run();
          recordAudit(conn.db, { ...scope, action: path, entityType: 'tax', entityId: row.id, summary: `Taxe ${archived ? 'archivée' : 'réactivée'} : ${row.name}` });
          return findScoped(scope.companyId, row.id);
        }),
      );
    });
  }
}
