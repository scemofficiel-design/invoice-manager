import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { searchAny } from '../../utils/search';
import { activityCreateSchema, activityUpdateSchema, listQuerySchema } from '@im/shared/schemas';
import type { Activity } from '@im/shared/types';
import { transaction } from '../../database/tx';
import { activities } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { diff, recordAudit } from '../audit/service';

const idParam = (p: unknown) => (p as { id: string }).id;
const toDto = ({ updatedAt: _u, ...r }: typeof activities.$inferSelect): Activity => r;

export async function activityRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId/activities';

  /** Toutes les requêtes filtrent par company_id : une activité d'une autre entreprise est introuvable. */
  const findScoped = (companyId: string, id: string) => {
    const row = conn.db.select().from(activities).where(and(eq(activities.companyId, companyId), eq(activities.id, id))).get();
    if (!row) throw notFound('Activité');
    return row;
  };

  app.get(base, { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(listQuerySchema, req.query);
    const conds = [eq(activities.companyId, req.company!.id)];
    if (!q.includeArchived) conds.push(isNull(activities.archivedAt));
    if (q.q) conds.push(searchAny(q.q, [activities.name, activities.code]));
    return conn.db.select().from(activities).where(and(...conds)).orderBy(asc(activities.name)).all().map(toDto);
  });

  app.post(base, { preHandler: companyAccess('admin') }, async (req, reply) => {
    const input = parse(activityCreateSchema, req.body);
    const scope = scopeOf(req);
    const row = transaction(conn, () => {
      const now = nowIso();
      const id = newId();
      conn.db.insert(activities).values({ ...input, id, companyId: scope.companyId, createdAt: now, updatedAt: now }).run();
      recordAudit(conn.db, { ...scope, action: 'create', entityType: 'activity', entityId: id, summary: `Activité créée : ${input.name}` });
      return findScoped(scope.companyId, id);
    });
    return reply.code(201).send(toDto(row));
  });

  app.patch(`${base}/:id`, { preHandler: companyAccess('admin') }, async (req) => {
    const input = parse(activityUpdateSchema, req.body);
    const scope = scopeOf(req);
    return toDto(
      transaction(conn, () => {
        const before = findScoped(scope.companyId, idParam(req.params));
        conn.db.update(activities).set({ ...input, updatedAt: nowIso() }).where(and(eq(activities.companyId, scope.companyId), eq(activities.id, before.id))).run();
        recordAudit(conn.db, { ...scope, action: 'update', entityType: 'activity', entityId: before.id, summary: `Activité modifiée : ${before.name}`, changes: diff(before, input) });
        return findScoped(scope.companyId, before.id);
      }),
    );
  });

  for (const [path, archived] of [['archive', true], ['unarchive', false]] as const) {
    app.post(`${base}/:id/${path}`, { preHandler: companyAccess('admin') }, async (req) => {
      const scope = scopeOf(req);
      return toDto(
        transaction(conn, () => {
          const row = findScoped(scope.companyId, idParam(req.params));
          conn.db.update(activities).set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() }).where(and(eq(activities.companyId, scope.companyId), eq(activities.id, row.id))).run();
          recordAudit(conn.db, { ...scope, action: path, entityType: 'activity', entityId: row.id, summary: `Activité ${archived ? 'archivée' : 'réactivée'} : ${row.name}` });
          return findScoped(scope.companyId, row.id);
        }),
      );
    });
  }
}
