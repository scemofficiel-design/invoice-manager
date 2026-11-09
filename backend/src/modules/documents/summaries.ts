/** Requêtes de liste réutilisées par plusieurs modules. Toujours filtrées par entreprise. */
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { searchAny } from '../../utils/search';
import { invoiceDisplayStatus, quoteDisplayStatus } from '@im/shared/status';
import type { InvoiceSummary, PaymentSummary, QuoteSummary } from '@im/shared/types';
import type { DB } from '../../database/connection';
import { clients, invoices, payments, quotes, receipts } from '../../database/schema';
import { todayLocal } from '../../utils/time';

export interface DocFilters {
  q?: string | undefined;
  status?: string | undefined;
  clientId?: string | undefined;
  activityId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
}

export function listQuoteSummaries(db: DB, companyId: string, f: DocFilters = {}): QuoteSummary[] {
  const conds: SQL[] = [eq(quotes.companyId, companyId)];
  if (f.clientId) conds.push(eq(quotes.clientId, f.clientId));
  if (f.activityId) conds.push(eq(quotes.activityId, f.activityId));
  if (f.from) conds.push(gte(quotes.issueDate, f.from));
  if (f.to) conds.push(lte(quotes.issueDate, f.to));
  if (f.q) conds.push(searchAny(f.q, [quotes.number, clients.name]));
  const today = todayLocal();
  const rows = db
    .select({ q: quotes, clientName: clients.name, invoiceId: invoices.id })
    .from(quotes)
    .innerJoin(clients, and(eq(clients.id, quotes.clientId), eq(clients.companyId, quotes.companyId)))
    .leftJoin(invoices, and(eq(invoices.sourceQuoteId, quotes.id), eq(invoices.companyId, quotes.companyId)))
    .where(and(...conds))
    .orderBy(desc(quotes.issueDate), desc(quotes.id))
    .limit(f.limit ?? 200)
    .all()
    .map(({ q, clientName, invoiceId }) => ({
      id: q.id,
      number: q.number,
      clientId: q.clientId,
      clientName,
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      currency: q.currency,
      totalMinor: q.totalMinor,
      status: q.status,
      displayStatus: quoteDisplayStatus(q, today),
      invoiceId,
    }));
  return f.status ? rows.filter((r) => r.displayStatus === f.status) : rows;
}

export function listInvoiceSummaries(db: DB, companyId: string, f: DocFilters = {}): InvoiceSummary[] {
  const conds: SQL[] = [eq(invoices.companyId, companyId)];
  if (f.clientId) conds.push(eq(invoices.clientId, f.clientId));
  if (f.activityId) conds.push(eq(invoices.activityId, f.activityId));
  if (f.from) conds.push(gte(invoices.issueDate, f.from));
  if (f.to) conds.push(lte(invoices.issueDate, f.to));
  if (f.q) conds.push(searchAny(f.q, [invoices.number, clients.name]));
  const today = todayLocal();
  const rows = db
    .select({ i: invoices, clientName: clients.name })
    .from(invoices)
    .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.companyId, invoices.companyId)))
    .where(and(...conds))
    .orderBy(desc(invoices.issueDate), desc(invoices.id))
    .limit(f.limit ?? 200)
    .all()
    .map(({ i, clientName }) => ({
      id: i.id,
      number: i.number,
      clientId: i.clientId,
      clientName,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      currency: i.currency,
      totalMinor: i.totalMinor,
      amountPaidMinor: i.amountPaidMinor,
      balanceMinor: i.status === 'issued' ? i.totalMinor - i.amountPaidMinor : 0,
      status: i.status,
      displayStatus: invoiceDisplayStatus(i, today),
    }));
  return f.status ? rows.filter((r) => r.displayStatus === f.status) : rows;
}

export function listPaymentSummaries(db: DB, companyId: string, f: { invoiceId?: string; clientId?: string; from?: string; to?: string; limit?: number } = {}): PaymentSummary[] {
  const conds: SQL[] = [eq(payments.companyId, companyId)];
  if (f.invoiceId) conds.push(eq(payments.invoiceId, f.invoiceId));
  if (f.clientId) conds.push(eq(payments.clientId, f.clientId));
  if (f.from) conds.push(gte(payments.paymentDate, f.from));
  if (f.to) conds.push(lte(payments.paymentDate, f.to));
  return db
    .select({ p: payments, clientName: clients.name, invoiceNumber: invoices.number, receiptId: receipts.id, receiptNumber: receipts.number })
    .from(payments)
    .innerJoin(clients, and(eq(clients.id, payments.clientId), eq(clients.companyId, payments.companyId)))
    .innerJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.companyId, payments.companyId)))
    .leftJoin(receipts, and(eq(receipts.paymentId, payments.id), eq(receipts.companyId, payments.companyId)))
    .where(and(...conds))
    .orderBy(desc(payments.paymentDate), desc(payments.id))
    .limit(f.limit ?? 200)
    .all()
    .map(({ p, clientName, invoiceNumber, receiptId, receiptNumber }) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber,
      clientId: p.clientId,
      clientName,
      paymentDate: p.paymentDate,
      amountMinor: p.amountMinor,
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      status: p.status,
      voidReason: p.voidReason,
      receiptId,
      receiptNumber,
      createdAt: p.createdAt,
    }));
}
