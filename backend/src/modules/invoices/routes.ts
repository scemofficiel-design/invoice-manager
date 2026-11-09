import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { documentListQuerySchema, invoiceInputSchema, reasonSchema } from '@im/shared/schemas';
import { invoiceDisplayStatus } from '@im/shared/status';
import type { Invoice } from '@im/shared/types';
import { transaction, type DB } from '../../database/connection';
import { clients, invoiceTaxTotals, invoices, payments, quotes } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { conflict, notFound } from '../../utils/errors';
import { addDays, newId, nowIso, todayLocal } from '../../utils/time';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';
import { linesToInput, loadSnapshotsFor, prepareDocument, readLines, totalsColumns, writeLines } from '../documents/core';
import { listInvoiceSummaries, listPaymentSummaries } from '../documents/summaries';
import { allocateNumber } from '../numbering/service';
import { archiveSafely, ensureInvoiceArchived } from '../../pdf/service';

type Row = typeof invoices.$inferSelect;

export function findInvoice(db: DB, companyId: string, id: string): Row {
  const row = db.select().from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.id, id))).get();
  if (!row) throw notFound('Facture');
  return row;
}

export function loadInvoice(db: DB, companyId: string, id: string): Invoice {
  const i = findInvoice(db, companyId, id);
  const client = db.select({ name: clients.name }).from(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, i.clientId))).get();
  const quote = i.sourceQuoteId ? db.select({ number: quotes.number }).from(quotes).where(and(eq(quotes.companyId, companyId), eq(quotes.id, i.sourceQuoteId))).get() : null;
  const { version: _v, createdBy: _c, pdfFileId: _p, ...rest } = i;
  return {
    ...rest,
    clientName: (i.clientSnapshot?.name as string | undefined) ?? client?.name ?? '',
    displayStatus: invoiceDisplayStatus(i, todayLocal()),
    sourceQuoteNumber: quote?.number ?? null,
    balanceMinor: i.status === 'issued' ? i.totalMinor - i.amountPaidMinor : 0,
    lines: readLines(db, 'invoice', companyId, i.id),
    taxTotals: db
      .select()
      .from(invoiceTaxTotals)
      .where(and(eq(invoiceTaxTotals.companyId, companyId), eq(invoiceTaxTotals.invoiceId, i.id)))
      .orderBy(asc(invoiceTaxTotals.name))
      .all()
      .map((t) => ({ taxId: t.taxId, name: t.name, ratePpm: t.ratePpm, isCompound: t.isCompound, registrationNumber: t.registrationNumber, baseMinor: t.baseMinor, amountMinor: t.amountMinor })),
    payments: listPaymentSummaries(db, companyId, { invoiceId: i.id, limit: 500 }),
  };
}

const assertDraft = (i: Row) => {
  if (i.status !== 'draft') throw conflict('INVOICE_IMMUTABLE', 'Une facture émise ne peut plus être modifiée');
};

export async function invoiceRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId/invoices';
  const idOf = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get(base, { preHandler: companyAccess('viewer') }, async (req) => listInvoiceSummaries(conn.db, req.company!.id, parse(documentListQuerySchema, req.query)));
  app.get(`${base}/:id`, { preHandler: companyAccess('viewer') }, async (req) => loadInvoice(conn.db, req.company!.id, idOf(req)));

  app.post(base, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const input = parse(invoiceInputSchema, req.body);
    const scope = scopeOf(req);
    const id = transaction(conn, () => {
      const p = prepareDocument(conn.db, scope.companyId, input);
      const id = newId();
      const now = nowIso();
      const { lines: _l, ...doc } = input;
      // Pas de numéro en brouillon : il est attribué à l'émission (séquence sans trou).
      conn.db.insert(invoices).values({ ...doc, ...totalsColumns(p), id, companyId: scope.companyId, status: 'draft', createdBy: scope.userId, createdAt: now, updatedAt: now }).run();
      writeLines(conn.db, 'invoice', scope.companyId, id, p);
      recordAudit(conn.db, { ...scope, action: 'create', entityType: 'invoice', entityId: id, summary: `Facture brouillon créée pour ${p.client.name}` });
      return id;
    });
    return reply.code(201).send(loadInvoice(conn.db, scope.companyId, id));
  });

  app.put(`${base}/:id`, { preHandler: companyAccess('editor') }, async (req) => {
    const input = parse(invoiceInputSchema, req.body);
    const scope = scopeOf(req);
    transaction(conn, () => {
      const i = findInvoice(conn.db, scope.companyId, idOf(req));
      assertDraft(i);
      const p = prepareDocument(conn.db, scope.companyId, input);
      const { lines: _l, ...doc } = input;
      conn.db.update(invoices).set({ ...doc, ...totalsColumns(p), version: i.version + 1, updatedAt: nowIso() }).where(and(eq(invoices.companyId, scope.companyId), eq(invoices.id, i.id))).run();
      writeLines(conn.db, 'invoice', scope.companyId, i.id, p);
      recordAudit(conn.db, { ...scope, action: 'update', entityType: 'invoice', entityId: i.id, summary: 'Facture brouillon modifiée' });
    });
    return loadInvoice(conn.db, scope.companyId, idOf(req));
  });

  app.delete(`${base}/:id`, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const scope = scopeOf(req);
    transaction(conn, () => {
      const i = findInvoice(conn.db, scope.companyId, idOf(req));
      if (i.status !== 'draft') throw conflict('INVOICE_NO_DELETE', 'Une facture émise ne peut pas être supprimée ; annulez-la');
      conn.db.delete(invoices).where(and(eq(invoices.companyId, scope.companyId), eq(invoices.id, i.id))).run();
      recordAudit(conn.db, { ...scope, action: 'delete', entityType: 'invoice', entityId: i.id, summary: `Facture brouillon supprimée (total ${i.totalMinor} ${i.currency})` });
    });
    return reply.code(204).send();
  });

  /** Émission : numéro définitif + instantanés, en une seule transaction. Le document devient figé. */
  app.post(`${base}/:id/issue`, { preHandler: companyAccess('editor') }, async (req) => {
    const scope = scopeOf(req);
    transaction(conn, () => {
      const i = findInvoice(conn.db, scope.companyId, idOf(req));
      assertDraft(i);
      if (readLines(conn.db, 'invoice', scope.companyId, i.id).length === 0) throw conflict('EMPTY_DOCUMENT', 'Ajoutez au moins une ligne avant d’émettre la facture');
      const number = allocateNumber(conn.db, scope.companyId, 'invoice', i.issueDate);
      const now = nowIso();
      conn.db
        .update(invoices)
        .set({ status: 'issued', number, issuedAt: now, ...loadSnapshotsFor(conn.db, scope.companyId, i.clientId), updatedAt: now })
        .where(and(eq(invoices.companyId, scope.companyId), eq(invoices.id, i.id)))
        .run();
      recordAudit(conn.db, { ...scope, action: 'issue', entityType: 'invoice', entityId: i.id, summary: `Facture ${number} émise (${i.totalMinor} ${i.currency})` });
    });
    await archiveSafely(req.log, () => ensureInvoiceArchived(conn, app.config, scope.companyId, idOf(req)));
    return loadInvoice(conn.db, scope.companyId, idOf(req));
  });

  app.post(`${base}/:id/cancel`, { preHandler: companyAccess('admin') }, async (req) => {
    const { reason } = parse(reasonSchema, req.body);
    const scope = scopeOf(req);
    transaction(conn, () => {
      const i = findInvoice(conn.db, scope.companyId, idOf(req));
      if (i.status !== 'issued') throw conflict('INVALID_TRANSITION', 'Seule une facture émise peut être annulée');
      const active = conn.db.select().from(payments).where(and(eq(payments.companyId, scope.companyId), eq(payments.invoiceId, i.id), eq(payments.status, 'recorded'))).get();
      if (active) throw conflict('HAS_PAYMENTS', 'Annulez d’abord les paiements enregistrés sur cette facture');
      const now = nowIso();
      conn.db.update(invoices).set({ status: 'cancelled', cancelledAt: now, cancelReason: reason, updatedAt: now }).where(and(eq(invoices.companyId, scope.companyId), eq(invoices.id, i.id))).run();
      recordAudit(conn.db, { ...scope, action: 'cancel', entityType: 'invoice', entityId: i.id, summary: `Facture ${i.number} annulée : ${reason}` });
    });
    return loadInvoice(conn.db, scope.companyId, idOf(req));
  });

  app.post(`${base}/:id/duplicate`, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const scope = scopeOf(req);
    const id = transaction(conn, () => {
      const src = loadInvoice(conn.db, scope.companyId, idOf(req));
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
      const today = todayLocal();
      const id = newId();
      const now = nowIso();
      const { lines: _l, ...doc } = input;
      conn.db
        .insert(invoices)
        .values({ ...doc, ...totalsColumns(p), id, companyId: scope.companyId, status: 'draft', locale: src.locale, issueDate: today, dueDate: addDays(today, p.company.paymentTermsDays), paymentTerms: src.paymentTerms, terms: src.terms, notes: src.notes, duplicatedFromId: src.id, createdBy: scope.userId, createdAt: now, updatedAt: now })
        .run();
      writeLines(conn.db, 'invoice', scope.companyId, id, p);
      recordAudit(conn.db, { ...scope, action: 'duplicate', entityType: 'invoice', entityId: id, summary: `Brouillon créé par duplication de ${src.number ?? 'brouillon'}` });
      return id;
    });
    return reply.code(201).send(loadInvoice(conn.db, scope.companyId, id));
  });
}
