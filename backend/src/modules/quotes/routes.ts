import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { documentListQuerySchema, quoteInputSchema } from '@im/shared/schemas';
import { QUOTE_TRANSITIONS, quoteDisplayStatus } from '@im/shared/status';
import type { Invoice, Quote } from '@im/shared/types';
import { transaction, type DB } from '../../database/tx';
import { clients, invoices, quotes } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { conflict, notFound } from '../../utils/errors';
import { addDays, newId, nowIso, todayLocal } from '../../utils/time';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';
import { linesToInput, loadSnapshotsFor, prepareDocument, readLines, totalsColumns, writeLines } from '../documents/core';
import { listQuoteSummaries } from '../documents/summaries';
import { allocateNumber } from '../numbering/service';
import { loadInvoice } from '../invoices/routes';

type Row = typeof quotes.$inferSelect;

function findQuote(db: DB, companyId: string, id: string): Row {
  const row = db.select().from(quotes).where(and(eq(quotes.companyId, companyId), eq(quotes.id, id))).get();
  if (!row) throw notFound('Devis');
  return row;
}

export function loadQuote(db: DB, companyId: string, id: string): Quote {
  const q = findQuote(db, companyId, id);
  const client = db.select({ name: clients.name }).from(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, q.clientId))).get();
  const inv = db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.sourceQuoteId, q.id))).get();
  const { version: _v, createdBy: _c, ...rest } = q;
  return {
    ...rest,
    clientName: (q.clientSnapshot?.name as string | undefined) ?? client?.name ?? '',
    displayStatus: quoteDisplayStatus(q, todayLocal()),
    invoiceId: inv?.id ?? null,
    invoiceNumber: inv?.number ?? null,
    lines: readLines(db, 'quote', companyId, q.id),
  };
}

export async function quoteRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId/quotes';
  const idOf = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get(base, { preHandler: companyAccess('viewer') }, async (req) => listQuoteSummaries(conn.db, req.company!.id, parse(documentListQuerySchema, req.query)));
  app.get(`${base}/:id`, { preHandler: companyAccess('viewer') }, async (req) => loadQuote(conn.db, req.company!.id, idOf(req)));

  app.post(base, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const input = parse(quoteInputSchema, req.body);
    const scope = scopeOf(req);
    const id = transaction(conn, () => {
      const p = prepareDocument(conn.db, scope.companyId, input);
      const id = newId();
      const now = nowIso();
      // Numéro attribué à la création : un devis abandonné est annulé, jamais supprimé.
      const number = allocateNumber(conn.db, scope.companyId, 'quote', input.issueDate);
      const { lines: _l, ...doc } = input;
      conn.db.insert(quotes).values({ ...doc, ...totalsColumns(p), id, companyId: scope.companyId, number, status: 'draft', createdBy: scope.userId, createdAt: now, updatedAt: now }).run();
      writeLines(conn.db, 'quote', scope.companyId, id, p);
      recordAudit(conn.db, { ...scope, action: 'create', entityType: 'quote', entityId: id, summary: `Devis ${number} créé` });
      return id;
    });
    return reply.code(201).send(loadQuote(conn.db, scope.companyId, id));
  });

  app.put(`${base}/:id`, { preHandler: companyAccess('editor') }, async (req) => {
    const input = parse(quoteInputSchema, req.body);
    const scope = scopeOf(req);
    transaction(conn, () => {
      const q = findQuote(conn.db, scope.companyId, idOf(req));
      if (q.status !== 'draft') throw conflict('QUOTE_IMMUTABLE', 'Seul un devis brouillon peut être modifié');
      const p = prepareDocument(conn.db, scope.companyId, input);
      const { lines: _l, ...doc } = input;
      conn.db.update(quotes).set({ ...doc, ...totalsColumns(p), version: q.version + 1, updatedAt: nowIso() }).where(and(eq(quotes.companyId, scope.companyId), eq(quotes.id, q.id))).run();
      writeLines(conn.db, 'quote', scope.companyId, q.id, p);
      recordAudit(conn.db, { ...scope, action: 'update', entityType: 'quote', entityId: q.id, summary: `Devis ${q.number} modifié` });
    });
    return loadQuote(conn.db, scope.companyId, idOf(req));
  });

  for (const [action, rule] of Object.entries(QUOTE_TRANSITIONS) as [keyof typeof QUOTE_TRANSITIONS, (typeof QUOTE_TRANSITIONS)[keyof typeof QUOTE_TRANSITIONS]][]) {
    app.post(`${base}/:id/${action}`, { preHandler: companyAccess('editor') }, async (req) => {
      const scope = scopeOf(req);
      transaction(conn, () => {
        const q = findQuote(conn.db, scope.companyId, idOf(req));
        if (!rule.from.includes(q.status)) throw conflict('INVALID_TRANSITION', `Action impossible sur un devis au statut « ${q.status} »`);
        const today = todayLocal();
        if (action === 'accept' && quoteDisplayStatus(q, today) === 'expired') throw conflict('QUOTE_EXPIRED', 'Ce devis est expiré : dupliquez-le pour en émettre un nouveau');
        if (action === 'send' && readLines(conn.db, 'quote', scope.companyId, q.id).length === 0) throw conflict('EMPTY_DOCUMENT', 'Ajoutez au moins une ligne avant d’envoyer le devis');
        if (action === 'cancel' && conn.db.select().from(invoices).where(and(eq(invoices.companyId, scope.companyId), eq(invoices.sourceQuoteId, q.id))).get()) {
          throw conflict('QUOTE_CONVERTED', 'Ce devis a déjà été converti en facture');
        }
        const now = nowIso();
        conn.db
          .update(quotes)
          .set({
            status: rule.to,
            ...(action === 'send' ? { sentAt: now, ...loadSnapshotsFor(conn.db, scope.companyId, q.clientId) } : {}),
            ...(action === 'accept' || action === 'refuse' ? { decidedAt: now } : {}),
            ...(action === 'cancel' ? { cancelledAt: now } : {}),
            updatedAt: now,
          })
          .where(and(eq(quotes.companyId, scope.companyId), eq(quotes.id, q.id)))
          .run();
        recordAudit(conn.db, { ...scope, action, entityType: 'quote', entityId: q.id, summary: `Devis ${q.number} : ${q.status} → ${rule.to}` });
      });
      return loadQuote(conn.db, scope.companyId, idOf(req));
    });
  }

  app.post(`${base}/:id/duplicate`, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const scope = scopeOf(req);
    const id = transaction(conn, () => {
      const src = loadQuote(conn.db, scope.companyId, idOf(req));
      const today = todayLocal();
      const validity = conn.db.select().from(quotes).where(eq(quotes.id, src.id)).get();
      const input = {
        clientId: src.clientId,
        activityId: src.activityId,
        currency: src.currency,
        pricesIncludeTax: src.pricesIncludeTax,
        docDiscountType: src.docDiscountType,
        docDiscountValue: src.docDiscountValue,
        lines: linesToInput(src.lines),
      };
      const p = prepareDocument(conn.db, scope.companyId, input);
      const days = Math.max(1, Math.round((Date.parse(validity!.validUntil) - Date.parse(validity!.issueDate)) / 86_400_000));
      const id = newId();
      const now = nowIso();
      const number = allocateNumber(conn.db, scope.companyId, 'quote', today);
      const { lines: _l, ...doc } = input;
      conn.db
        .insert(quotes)
        .values({ ...doc, ...totalsColumns(p), id, companyId: scope.companyId, number, status: 'draft', locale: src.locale, issueDate: today, validUntil: addDays(today, days), terms: src.terms, notes: src.notes, duplicatedFromId: src.id, createdBy: scope.userId, createdAt: now, updatedAt: now })
        .run();
      writeLines(conn.db, 'quote', scope.companyId, id, p);
      recordAudit(conn.db, { ...scope, action: 'duplicate', entityType: 'quote', entityId: id, summary: `Devis ${number} créé par duplication de ${src.number}` });
      return id;
    });
    return reply.code(201).send(loadQuote(conn.db, scope.companyId, id));
  });

  /**
   * Conversion idempotente : un second appel (double clic, nouvel essai) renvoie la facture déjà
   * créée au lieu d'en créer une autre. Garanti aussi par l'index unique sur source_quote_id.
   */
  app.post(`${base}/:id/convert`, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const scope = scopeOf(req);
    const { invoiceId, created } = transaction(conn, () => {
      const q = loadQuote(conn.db, scope.companyId, idOf(req));
      if (q.invoiceId) return { invoiceId: q.invoiceId, created: false };
      if (q.status !== 'accepted') throw conflict('QUOTE_NOT_ACCEPTED', 'Seul un devis accepté peut être converti en facture');
      const input = {
        clientId: q.clientId,
        activityId: q.activityId,
        currency: q.currency,
        pricesIncludeTax: q.pricesIncludeTax,
        docDiscountType: q.docDiscountType,
        docDiscountValue: q.docDiscountValue,
        lines: linesToInput(q.lines),
      };
      const p = prepareDocument(conn.db, scope.companyId, input, { allowArchivedClient: true });
      const today = todayLocal();
      const id = newId();
      const now = nowIso();
      const { lines: _l, ...doc } = input;
      conn.db
        .insert(invoices)
        .values({ ...doc, ...totalsColumns(p), id, companyId: scope.companyId, status: 'draft', locale: q.locale, issueDate: today, dueDate: addDays(today, p.company.paymentTermsDays), terms: q.terms, notes: q.notes, sourceQuoteId: q.id, createdBy: scope.userId, createdAt: now, updatedAt: now })
        .run();
      writeLines(conn.db, 'invoice', scope.companyId, id, p);
      recordAudit(conn.db, { ...scope, action: 'convert', entityType: 'quote', entityId: q.id, summary: `Devis ${q.number} converti en facture (brouillon)` });
      return { invoiceId: id, created: true };
    });
    const invoice: Invoice = loadInvoice(conn.db, scope.companyId, invoiceId);
    return reply.code(created ? 201 : 200).send(invoice);
  });
}
