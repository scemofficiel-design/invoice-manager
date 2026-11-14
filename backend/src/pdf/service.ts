/**
 * Production et archivage des PDF.
 * - Facture émise / reçu : PDF généré une seule fois, archivé dans documents/ avec son empreinte
 *   SHA-256, puis toujours resservi à l'identique (vérification d'intégrité à chaque lecture).
 * - Brouillons, devis, documents annulés : rendu à la demande (filigrane le cas échéant).
 */
import { and, eq } from 'drizzle-orm';
type Logger = { error: (obj: unknown, msg?: string) => void };
import type { LegalId } from '@im/shared/types';
import { transaction, type Connection, type DB } from '../database/tx';
import { clients, companies, currencies, invoices, receipts } from '../database/schema';
import { readStoredFile, safeFileName, storeFile } from '../modules/files/service';
import { loadInvoice } from '../modules/invoices/routes';
import { loadQuote } from '../modules/quotes/routes';
import { notFound } from '../utils/errors';
import { toBase64 } from '../utils/bytes';
import { renderDocumentPdf, renderReceiptPdf, type PartyInfo } from './render';

type Snap = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

function minorUnits(db: DB, code: string) {
  return db.select({ m: currencies.minorUnits }).from(currencies).where(eq(currencies.code, code)).get()?.m ?? 2;
}

function logoDataUrl(conn: Connection, companyId: string, fileId: unknown): string | null {
  if (typeof fileId !== 'string') return null;
  try {
    const f = readStoredFile(conn, fileId, companyId);
    return `data:${f.mime};base64,${toBase64(f.content)}`;
  } catch {
    return null;
  }
}

function seller(s: Snap): PartyInfo {
  return {
    name: str(s.legalName) ?? '',
    tradeName: str(s.tradeName),
    addressLine1: str(s.addressLine1),
    addressLine2: str(s.addressLine2),
    city: str(s.city),
    region: str(s.region),
    postalCode: str(s.postalCode),
    country: str(s.country),
    phone: str(s.phone),
    email: str(s.email),
    website: str(s.website),
    ids: (s.legalIds as LegalId[] | undefined) ?? [],
  };
}

function buyer(s: Snap): PartyInfo {
  return {
    name: str(s.name) ?? '',
    contactName: str(s.contactName),
    addressLine1: str(s.addressLine1),
    addressLine2: str(s.addressLine2),
    city: str(s.city),
    region: str(s.region),
    postalCode: str(s.postalCode),
    country: str(s.country),
    email: str(s.email),
    ids: (s.taxIds as LegalId[] | undefined) ?? [],
  };
}

/** Données courantes (brouillon) ou figées (document envoyé / émis). */
function parties(db: DB, companyId: string, doc: { companySnapshot: Snap | null; clientSnapshot: Snap | null; clientId: string }) {
  const company = doc.companySnapshot ?? (db.select().from(companies).where(eq(companies.id, companyId)).get() as unknown as Snap);
  const client = doc.clientSnapshot ?? (db.select().from(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, doc.clientId))).get() as unknown as Snap);
  return { company, client };
}

const safeName = safeFileName;

/** Lit un PDF archivé dans la base (empreinte vérifiée par readStoredFile). */
function readArchived(conn: Connection, companyId: string, fileId: string): Uint8Array | null {
  try {
    return readStoredFile(conn, fileId, companyId).content;
  } catch (e) {
    if ((e as { code?: string }).code === 'INTEGRITY_ERROR') throw e;
    return null;
  }
}

export async function quotePdf(conn: Connection, companyId: string, id: string): Promise<{ buffer: Uint8Array; filename: string }> {
  const q = loadQuote(conn.db, companyId, id);
  const { company, client } = parties(conn.db, companyId, q);
  const taxTotals = Object.values(
    q.lines.flatMap((l) => l.taxes).reduce<Record<string, { name: string; ratePpm: number; amountMinor: number; registrationNumber: string | null }>>((acc, t) => {
      const k = `${t.name}|${t.ratePpm}`;
      acc[k] = { name: t.name, ratePpm: t.ratePpm, registrationNumber: t.registrationNumber, amountMinor: (acc[k]?.amountMinor ?? 0) + t.amountMinor };
      return acc;
    }, {}),
  );
  const buffer = await renderDocumentPdf({
    kind: 'quote',
    locale: q.locale,
    number: q.number,
    issueDate: q.issueDate,
    secondDate: q.validUntil,
    currency: q.currency,
    minorUnits: minorUnits(conn.db, q.currency),
    seller: seller(company),
    buyer: buyer(client),
    logo: logoDataUrl(conn, companyId, company.logoFileId),
    lines: q.lines,
    subtotalMinor: q.subtotalMinor,
    discountMinor: q.discountMinor,
    taxableBaseMinor: q.taxableBaseMinor,
    taxTotals,
    totalMinor: q.totalMinor,
    pricesIncludeTax: q.pricesIncludeTax,
    terms: q.terms,
    notes: q.notes,
    bankDetails: null,
    legalFooter: str(company.legalFooter),
    exemptionRef: client.taxExempt ? str(client.exemptionRef) ?? '' : null,
    watermark: q.status === 'draft' ? 'draft' : q.status === 'cancelled' ? 'cancelled' : null,
  });
  return { buffer, filename: `${safeName(q.number ?? 'devis')}.pdf` };
}

async function renderInvoice(conn: Connection, companyId: string, id: string) {
  const inv = loadInvoice(conn.db, companyId, id);
  const { company, client } = parties(conn.db, companyId, inv);
  const buffer = await renderDocumentPdf({
    kind: 'invoice',
    locale: inv.locale,
    number: inv.number,
    issueDate: inv.issueDate,
    secondDate: inv.dueDate,
    currency: inv.currency,
    minorUnits: minorUnits(conn.db, inv.currency),
    seller: seller(company),
    buyer: buyer(client),
    logo: logoDataUrl(conn, companyId, company.logoFileId),
    lines: inv.lines,
    subtotalMinor: inv.subtotalMinor,
    discountMinor: inv.discountMinor,
    taxableBaseMinor: inv.taxableBaseMinor,
    taxTotals: inv.taxTotals,
    totalMinor: inv.totalMinor,
    pricesIncludeTax: inv.pricesIncludeTax,
    // Le PDF archivé est l'original à l'émission : les paiements ultérieurs n'y figurent pas.
    amountPaidMinor: 0,
    paymentTerms: inv.paymentTerms,
    terms: inv.terms,
    notes: inv.notes,
    bankDetails: str(company.bankDetails),
    legalFooter: str(company.legalFooter),
    sourceQuoteNumber: inv.sourceQuoteNumber,
    exemptionRef: client.taxExempt ? str(client.exemptionRef) ?? '' : null,
    watermark: inv.status === 'draft' ? 'draft' : inv.status === 'cancelled' ? 'cancelled' : null,
  });
  return { inv, buffer };
}

/** Génère et archive le PDF d'une facture émise si ce n'est pas déjà fait. Idempotent. */
export async function ensureInvoiceArchived(conn: Connection, companyId: string, id: string): Promise<string | null> {
  const row = conn.db.select().from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.id, id))).get();
  if (!row || row.status === 'draft') return null;
  if (row.pdfFileId) return row.pdfFileId;
  const { inv, buffer } = await renderInvoice(conn, companyId, id);
  if (inv.status !== 'issued' && inv.status !== 'cancelled') return null;
  const relPath = `companies/${companyId}/invoices/${inv.issueDate.slice(0, 4)}/${safeName(inv.number!)}.pdf`;
  return transaction(conn, () => {
    const again = conn.db.select({ f: invoices.pdfFileId }).from(invoices).where(eq(invoices.id, id)).get();
    if (again?.f) return again.f;
    const fileId = storeFile(conn.db, { companyId, kind: 'pdf', entityType: 'invoice', entityId: id, relPath, mime: 'application/pdf', content: buffer });
    conn.db.update(invoices).set({ pdfFileId: fileId }).where(and(eq(invoices.companyId, companyId), eq(invoices.id, id))).run();
    return fileId;
  });
}

export async function invoicePdf(conn: Connection, companyId: string, id: string): Promise<{ buffer: Uint8Array; filename: string; archived: boolean }> {
  const row = conn.db.select().from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.id, id))).get();
  if (!row) throw notFound('Facture');
  if (row.status === 'issued') {
    const fileId = await ensureInvoiceArchived(conn, companyId, id);
    const buf = fileId ? readArchived(conn, companyId, fileId) : null;
    if (buf) return { buffer: buf, filename: `${safeName(row.number!)}.pdf`, archived: true };
  }
  const { buffer } = await renderInvoice(conn, companyId, id);
  return { buffer, filename: `${safeName(row.number ?? 'facture-brouillon')}.pdf`, archived: false };
}

async function renderReceipt(conn: Connection, companyId: string, id: string) {
  const r = conn.db.select().from(receipts).where(and(eq(receipts.companyId, companyId), eq(receipts.id, id))).get();
  if (!r) throw notFound('Reçu');
  const snap = r.snapshot as { company: Snap; client: Snap; invoice: { number: string; issueDate: string; totalMinor: number }; payment: { method: string; reference: string | null } };
  const locale = (str(snap.company.defaultLocale) as 'fr' | 'en' | null) ?? 'fr';
  const buffer = await renderReceiptPdf({
    locale,
    number: r.number,
    issueDate: r.issueDate,
    currency: r.currency,
    minorUnits: minorUnits(conn.db, r.currency),
    seller: seller(snap.company),
    buyer: buyer(snap.client),
    logo: logoDataUrl(conn, companyId, snap.company.logoFileId),
    invoiceNumber: snap.invoice.number,
    invoiceDate: snap.invoice.issueDate,
    invoiceTotalMinor: snap.invoice.totalMinor,
    method: snap.payment.method,
    reference: snap.payment.reference,
    amountMinor: r.amountMinor,
    balanceBeforeMinor: r.balanceBeforeMinor,
    balanceAfterMinor: r.balanceAfterMinor,
    isFullPayment: r.isFullPayment,
    legalFooter: str(snap.company.legalFooter),
    void: r.status === 'void',
  });
  return { r, buffer };
}

export async function ensureReceiptArchived(conn: Connection, companyId: string, id: string): Promise<string | null> {
  const row = conn.db.select().from(receipts).where(and(eq(receipts.companyId, companyId), eq(receipts.id, id))).get();
  if (!row) return null;
  if (row.pdfFileId) return row.pdfFileId;
  const { r, buffer } = await renderReceipt(conn, companyId, id);
  if (r.status === 'void') return null;
  const relPath = `companies/${companyId}/receipts/${r.issueDate.slice(0, 4)}/${safeName(r.number)}.pdf`;
  return transaction(conn, () => {
    const again = conn.db.select({ f: receipts.pdfFileId }).from(receipts).where(eq(receipts.id, id)).get();
    if (again?.f) return again.f;
    const fileId = storeFile(conn.db, { companyId, kind: 'pdf', entityType: 'receipt', entityId: id, relPath, mime: 'application/pdf', content: buffer });
    conn.db.update(receipts).set({ pdfFileId: fileId }).where(eq(receipts.id, id)).run();
    return fileId;
  });
}

export async function receiptPdf(conn: Connection, companyId: string, id: string): Promise<{ buffer: Uint8Array; filename: string; archived: boolean }> {
  const row = conn.db.select().from(receipts).where(and(eq(receipts.companyId, companyId), eq(receipts.id, id))).get();
  if (!row) throw notFound('Reçu');
  if (row.status === 'valid') {
    const fileId = await ensureReceiptArchived(conn, companyId, id);
    const buf = fileId ? readArchived(conn, companyId, fileId) : null;
    if (buf) return { buffer: buf, filename: `${safeName(row.number)}.pdf`, archived: true };
  }
  const { buffer } = await renderReceipt(conn, companyId, id);
  return { buffer, filename: `${safeName(row.number)}.pdf`, archived: false };
}

/** Archivage juste après émission / paiement : un échec est journalisé sans annuler l'opération métier
 * (le PDF sera alors généré et archivé à la première consultation). */
export async function archiveSafely(log: Logger, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (err) {
    log.error(err, 'Archivage PDF différé');
  }
}
