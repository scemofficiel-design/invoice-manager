import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { searchAny } from '../../utils/search';
import { clientCreateSchema, clientUpdateSchema, listQuerySchema } from '@im/shared/schemas';
import type { Balance, Client, ClientDetail } from '@im/shared/types';
import { transaction } from '../../database/connection';
import { clients, currencies } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { badRequest, notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { diff, recordAudit } from '../audit/service';
import { listInvoiceSummaries, listPaymentSummaries, listQuoteSummaries } from '../documents/summaries';

type Row = typeof clients.$inferSelect;
const toDto = ({ updatedAt: _u, ...r }: Row): Client => r;

export function findClient(db: FastifyInstance['conn']['db'], companyId: string, id: string): Row {
  const row = db.select().from(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, id))).get();
  if (!row) throw notFound('Client');
  return row;
}

export async function clientRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId/clients';
  const checkCurrency = (code: string | null | undefined) => {
    if (code && !conn.db.select().from(currencies).where(eq(currencies.code, code)).get()) throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue : ${code}`);
  };

  app.get(base, { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(listQuerySchema, req.query);
    const conds: SQL[] = [eq(clients.companyId, req.company!.id)];
    if (!q.includeArchived) conds.push(isNull(clients.archivedAt));
    if (q.q) {
      conds.push(searchAny(q.q, [clients.name, clients.contactName, clients.email, clients.city]));
    }
    return conn.db.select().from(clients).where(and(...conds)).orderBy(asc(clients.name)).limit(1000).all().map(toDto);
  });

  app.get(`${base}/:id`, { preHandler: companyAccess('viewer') }, async (req): Promise<ClientDetail> => {
    const companyId = req.company!.id;
    const c = findClient(conn.db, companyId, (req.params as { id: string }).id);
    const invoices = listInvoiceSummaries(conn.db, companyId, { clientId: c.id, limit: 500 });
    // Soldes par devise : jamais d'addition entre devises différentes.
    const map = new Map<string, Balance>();
    for (const i of invoices) {
      if (i.status !== 'issued') continue;
      const b = map.get(i.currency) ?? { currency: i.currency, invoicedMinor: 0, paidMinor: 0, dueMinor: 0 };
      b.invoicedMinor += i.totalMinor;
      b.paidMinor += i.amountPaidMinor;
      b.dueMinor += i.totalMinor - i.amountPaidMinor;
      map.set(i.currency, b);
    }
    return {
      ...toDto(c),
      balances: [...map.values()],
      quotes: listQuoteSummaries(conn.db, companyId, { clientId: c.id, limit: 500 }),
      invoices,
      payments: listPaymentSummaries(conn.db, companyId, { clientId: c.id, limit: 500 }),
    };
  });

  app.post(base, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const input = parse(clientCreateSchema, req.body);
    checkCurrency(input.preferredCurrency);
    const scope = scopeOf(req);
    const row = transaction(conn, () => {
      const now = nowIso();
      const id = newId();
      conn.db.insert(clients).values({ ...input, id, companyId: scope.companyId, createdAt: now, updatedAt: now }).run();
      recordAudit(conn.db, { ...scope, action: 'create', entityType: 'client', entityId: id, summary: `Client créé : ${input.name}` });
      return findClient(conn.db, scope.companyId, id);
    });
    return reply.code(201).send(toDto(row));
  });

  app.patch(`${base}/:id`, { preHandler: companyAccess('editor') }, async (req) => {
    const input = parse(clientUpdateSchema, req.body);
    checkCurrency(input.preferredCurrency);
    const scope = scopeOf(req);
    return toDto(
      transaction(conn, () => {
        const before = findClient(conn.db, scope.companyId, (req.params as { id: string }).id);
        conn.db.update(clients).set({ ...input, updatedAt: nowIso() }).where(and(eq(clients.companyId, scope.companyId), eq(clients.id, before.id))).run();
        recordAudit(conn.db, { ...scope, action: 'update', entityType: 'client', entityId: before.id, summary: `Client modifié : ${before.name}`, changes: diff(before, input) });
        return findClient(conn.db, scope.companyId, before.id);
      }),
    );
  });

  for (const [path, archived] of [['archive', true], ['unarchive', false]] as const) {
    app.post(`${base}/:id/${path}`, { preHandler: companyAccess('editor') }, async (req) => {
      const scope = scopeOf(req);
      return toDto(
        transaction(conn, () => {
          const row = findClient(conn.db, scope.companyId, (req.params as { id: string }).id);
          conn.db.update(clients).set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() }).where(and(eq(clients.companyId, scope.companyId), eq(clients.id, row.id))).run();
          recordAudit(conn.db, { ...scope, action: path, entityType: 'client', entityId: row.id, summary: `Client ${archived ? 'archivé' : 'réactivé'} : ${row.name}` });
          return findClient(conn.db, scope.companyId, row.id);
        }),
      );
    });
  }
}
