import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { paymentCreateSchema, reasonSchema } from '@im/shared/schemas';
import type { PaymentSummary, Receipt, ReceiptSnapshot } from '@im/shared/types';
import { transaction, type DB } from '../../database/tx';
import { invoices, payments, receipts } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { newId, nowIso, todayLocal } from '../../utils/time';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';
import { listPaymentSummaries } from '../documents/summaries';
import { findInvoice } from '../invoices/routes';
import { allocateNumber } from '../numbering/service';
import { archiveSafely, ensureReceiptArchived } from '../../pdf/service';

const toReceipt = ({ companyId, pdfFileId: _p, ...r }: typeof receipts.$inferSelect): Receipt => ({ ...r, companyId, snapshot: r.snapshot as unknown as ReceiptSnapshot });

function findPaymentSummary(db: DB, companyId: string, id: string): PaymentSummary {
  const p = listPaymentSummaries(db, companyId, { limit: 1000 }).find((x) => x.id === id);
  if (!p) throw notFound('Paiement');
  return p;
}

export async function paymentRoutes(app: FastifyInstance) {
  const { conn } = app;
  const base = '/companies/:companyId';

  app.get(`${base}/payments`, { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(z.object({ invoiceId: z.string().optional(), clientId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }), req.query);
    return listPaymentSummaries(conn.db, req.company!.id, { ...q, limit: 500 });
  });

  /**
   * Enregistrement d'un paiement et génération du reçu dans la même transaction.
   * Refusé si la facture n'est pas émise, si la devise diffère ou si le montant dépasse le solde.
   * La clé d'idempotence évite tout double enregistrement (double clic, renvoi du formulaire).
   */
  app.post(`${base}/payments`, { preHandler: companyAccess('editor') }, async (req, reply) => {
    const input = parse(paymentCreateSchema, req.body);
    const scope = scopeOf(req);
    const result = transaction(conn, () => {
      const existing = conn.db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey)).get();
      if (existing) {
        if (existing.companyId !== scope.companyId) throw conflict('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée');
        return { id: existing.id, created: false };
      }
      const inv = findInvoice(conn.db, scope.companyId, input.invoiceId);
      if (inv.status !== 'issued') throw conflict('INVOICE_NOT_PAYABLE', inv.status === 'draft' ? 'Émettez la facture avant d’enregistrer un paiement' : 'Cette facture est annulée');
      if (input.currency && input.currency !== inv.currency) throw badRequest('CURRENCY_MISMATCH', `Le paiement doit être en ${inv.currency}, devise de la facture`);
      const balance = inv.totalMinor - inv.amountPaidMinor;
      if (balance <= 0) throw conflict('INVOICE_PAID', 'Cette facture est déjà entièrement payée');
      if (input.amountMinor > balance) throw badRequest('AMOUNT_EXCEEDS_BALANCE', 'Le montant dépasse le solde restant de la facture');
      if (input.paymentDate < inv.issueDate) throw badRequest('INVALID_DATE', 'La date du paiement précède la date de la facture');
      if (input.paymentDate > todayLocal()) throw badRequest('INVALID_DATE', 'La date du paiement ne peut pas être dans le futur');

      const now = nowIso();
      const id = newId();
      conn.db
        .insert(payments)
        .values({ id, companyId: scope.companyId, invoiceId: inv.id, clientId: inv.clientId, paymentDate: input.paymentDate, amountMinor: input.amountMinor, currency: inv.currency, method: input.method, reference: input.reference, notes: input.notes, idempotencyKey: input.idempotencyKey, createdBy: scope.userId, createdAt: now })
        .run();
      const after = balance - input.amountMinor;
      conn.db.update(invoices).set({ amountPaidMinor: inv.amountPaidMinor + input.amountMinor, updatedAt: now }).where(and(eq(invoices.companyId, scope.companyId), eq(invoices.id, inv.id))).run();

      const number = allocateNumber(conn.db, scope.companyId, 'receipt', input.paymentDate);
      const snapshot: ReceiptSnapshot = {
        company: inv.companySnapshot ?? {},
        client: inv.clientSnapshot ?? {},
        invoice: { id: inv.id, number: inv.number!, issueDate: inv.issueDate, totalMinor: inv.totalMinor, currency: inv.currency },
        payment: { date: input.paymentDate, method: input.method, reference: input.reference },
      };
      conn.db
        .insert(receipts)
        .values({ id: newId(), companyId: scope.companyId, paymentId: id, number, issueDate: input.paymentDate, amountMinor: input.amountMinor, currency: inv.currency, balanceBeforeMinor: balance, balanceAfterMinor: after, isFullPayment: after === 0, snapshot: snapshot as unknown as Record<string, unknown>, createdAt: now })
        .run();
      recordAudit(conn.db, { ...scope, action: 'payment', entityType: 'invoice', entityId: inv.id, summary: `Paiement de ${input.amountMinor} ${inv.currency} sur ${inv.number} — reçu ${number}` });
      return { id, created: true };
    });
    const summary = findPaymentSummary(conn.db, scope.companyId, result.id);
    if (summary.receiptId) await archiveSafely(req.log, () => ensureReceiptArchived(conn, scope.companyId, summary.receiptId!));
    return reply.code(result.created ? 201 : 200).send(summary);
  });

  /** Correction : un paiement n'est jamais supprimé, il est annulé (motif journalisé) et son reçu marqué annulé. */
  app.post(`${base}/payments/:id/void`, { preHandler: companyAccess('admin') }, async (req) => {
    const { reason } = parse(reasonSchema, req.body);
    const scope = scopeOf(req);
    const id = (req.params as { id: string }).id;
    transaction(conn, () => {
      const p = conn.db.select().from(payments).where(and(eq(payments.companyId, scope.companyId), eq(payments.id, id))).get();
      if (!p) throw notFound('Paiement');
      if (p.status === 'voided') throw conflict('ALREADY_VOIDED', 'Ce paiement est déjà annulé');
      const inv = findInvoice(conn.db, scope.companyId, p.invoiceId);
      const now = nowIso();
      conn.db.update(payments).set({ status: 'voided', voidedAt: now, voidReason: reason }).where(eq(payments.id, p.id)).run();
      conn.db.update(invoices).set({ amountPaidMinor: inv.amountPaidMinor - p.amountMinor, updatedAt: now }).where(and(eq(invoices.companyId, scope.companyId), eq(invoices.id, inv.id))).run();
      conn.db.update(receipts).set({ status: 'void' }).where(and(eq(receipts.companyId, scope.companyId), eq(receipts.paymentId, p.id))).run();
      recordAudit(conn.db, { ...scope, action: 'payment_void', entityType: 'invoice', entityId: inv.id, summary: `Paiement de ${p.amountMinor} ${p.currency} annulé sur ${inv.number} : ${reason}` });
    });
    return findPaymentSummary(conn.db, scope.companyId, id);
  });

  app.get(`${base}/receipts`, { preHandler: companyAccess('viewer') }, async (req) =>
    conn.db.select().from(receipts).where(eq(receipts.companyId, req.company!.id)).orderBy(desc(receipts.issueDate), desc(receipts.id)).limit(500).all().map(toReceipt),
  );

  app.get(`${base}/receipts/:id`, { preHandler: companyAccess('viewer') }, async (req) => {
    const r = conn.db.select().from(receipts).where(and(eq(receipts.companyId, req.company!.id), eq(receipts.id, (req.params as { id: string }).id))).get();
    if (!r) throw notFound('Reçu');
    return toReceipt(r);
  });
}
