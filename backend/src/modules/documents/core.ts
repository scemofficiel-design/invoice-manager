/**
 * Cœur commun aux devis et factures : validation des références, calcul faisant foi (le backend
 * recalcule toujours, les totaux envoyés par le client sont ignorés), écriture des lignes et
 * instantanés (snapshots) client / entreprise.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { computeDocument, type DocumentResult, type TaxDefinition } from '@im/shared/tax';
import type { documentLineSchema } from '@im/shared/schemas';
import type { DocumentLine } from '@im/shared/types';
import type { DB } from '../../database/connection';
import {
  activities,
  catalogItems,
  clients,
  companies,
  currencies,
  invoiceLineTaxes,
  invoiceLines,
  invoiceTaxTotals,
  quoteLineTaxes,
  quoteLines,
  taxes,
} from '../../database/schema';
import { badRequest, notFound } from '../../utils/errors';
import { newId } from '../../utils/time';

export type LineInput = z.output<typeof documentLineSchema>;

export interface DocumentDraftInput {
  clientId: string;
  activityId: string | null;
  currency: string;
  pricesIncludeTax: boolean;
  docDiscountType: 'percent' | 'amount' | null;
  docDiscountValue: number | null;
  lines: LineInput[];
}

export interface PreparedLine {
  input: LineInput;
  taxes: TaxDefinition[];
  taxTreatment: LineInput['taxTreatment'];
}

export interface Prepared {
  client: typeof clients.$inferSelect;
  company: typeof companies.$inferSelect;
  lines: PreparedLine[];
  result: DocumentResult;
}

/** Valide toutes les références (même entreprise) puis calcule le document. */
export function prepareDocument(db: DB, companyId: string, input: DocumentDraftInput, opts: { allowArchivedClient?: boolean } = {}): Prepared {
  const company = db.select().from(companies).where(eq(companies.id, companyId)).get();
  if (!company) throw notFound('Entreprise');
  const client = db.select().from(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, input.clientId))).get();
  if (!client) throw badRequest('INVALID_CLIENT', 'Client inconnu pour cette entreprise');
  if (client.archivedAt && !opts.allowArchivedClient) throw badRequest('CLIENT_ARCHIVED', 'Ce client est archivé');
  if (input.activityId && !db.select().from(activities).where(and(eq(activities.companyId, companyId), eq(activities.id, input.activityId))).get()) {
    throw badRequest('INVALID_ACTIVITY', 'Activité inconnue pour cette entreprise');
  }
  const currency = db.select().from(currencies).where(eq(currencies.code, input.currency)).get();
  if (!currency || !currency.isActive) throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue ou inactive : ${input.currency}`);

  const allTaxIds = [...new Set(input.lines.flatMap((l) => l.taxIds))];
  const taxRows = allTaxIds.length ? db.select().from(taxes).where(and(eq(taxes.companyId, companyId), inArray(taxes.id, allTaxIds))).all() : [];
  if (taxRows.length !== allTaxIds.length) throw badRequest('INVALID_TAX', 'Taxe inconnue pour cette entreprise');
  const taxMap = new Map(taxRows.map((t) => [t.id, t]));

  const catalogIds = [...new Set(input.lines.map((l) => l.catalogItemId).filter((x): x is string => !!x))];
  if (catalogIds.length) {
    const items = db.select().from(catalogItems).where(and(eq(catalogItems.companyId, companyId), inArray(catalogItems.id, catalogIds))).all();
    if (items.length !== catalogIds.length) throw badRequest('INVALID_CATALOG_ITEM', 'Article inconnu pour cette entreprise');
    // Pas de conversion implicite : un article dans une autre devise ne peut pas être ajouté tel quel.
    const mismatch = items.find((i) => i.currency !== input.currency);
    if (mismatch) throw badRequest('CURRENCY_MISMATCH', `L’article « ${mismatch.name} » est en ${mismatch.currency}, le document en ${input.currency}`);
  }

  const lines: PreparedLine[] = input.lines.map((l) => {
    // Client exonéré : aucune taxe n'est appliquée.
    const taxTreatment = client.taxExempt ? 'exempt' : l.taxTreatment;
    return {
      input: l,
      taxTreatment,
      taxes: l.taxIds.map((tid) => {
        const t = taxMap.get(tid)!;
        return { key: t.id, name: t.name, ratePpm: t.ratePpm, isCompound: t.isCompound, registrationNumber: t.registrationNumber };
      }),
    };
  });

  const discount = (type: 'percent' | 'amount' | null, value: number | null) =>
    type === 'percent' ? { type, valuePpm: value ?? 0 } : type === 'amount' ? { type, valueMinor: value ?? 0 } : null;

  let result: DocumentResult;
  try {
    result = computeDocument({
      pricesIncludeTax: input.pricesIncludeTax,
      rounding: company.taxRounding,
      documentDiscount: discount(input.docDiscountType, input.docDiscountValue),
      lines: lines.map((l) => ({
        quantityMilli: l.input.quantityMilli,
        unitPriceMinor: l.input.unitPriceMinor,
        discount: discount(l.input.discountType, l.input.discountValue),
        taxTreatment: l.taxTreatment,
        taxes: l.taxes,
      })),
    });
  } catch (err) {
    throw badRequest('CALCULATION_ERROR', (err as Error).message);
  }
  return { client, company, lines, result };
}

export function totalsColumns(p: Prepared) {
  const r = p.result;
  return {
    subtotalMinor: r.subtotalMinor,
    discountMinor: r.discountMinor,
    netMinor: r.netMinor,
    taxableBaseMinor: r.taxableBaseMinor,
    taxTotalMinor: r.taxTotalMinor,
    totalMinor: r.totalMinor,
    taxRounding: p.company.taxRounding,
  };
}

type Kind = 'quote' | 'invoice';

/** Remplace les lignes d'un document brouillon (les triggers refusent toute écriture hors brouillon). */
export function writeLines(db: DB, kind: Kind, companyId: string, documentId: string, p: Prepared): void {
  if (kind === 'quote') db.delete(quoteLines).where(and(eq(quoteLines.companyId, companyId), eq(quoteLines.quoteId, documentId))).run();
  else {
    db.delete(invoiceLines).where(and(eq(invoiceLines.companyId, companyId), eq(invoiceLines.invoiceId, documentId))).run();
    db.delete(invoiceTaxTotals).where(and(eq(invoiceTaxTotals.companyId, companyId), eq(invoiceTaxTotals.invoiceId, documentId))).run();
  }
  p.lines.forEach((l, i) => {
    const r = p.result.lines[i]!;
    const lineId = newId();
    const row = {
      id: lineId,
      companyId,
      position: i,
      catalogItemId: l.input.catalogItemId,
      kind: l.input.kind,
      sku: l.input.sku,
      name: l.input.name,
      description: l.input.description,
      unit: l.input.unit,
      quantityMilli: l.input.quantityMilli,
      unitPriceMinor: l.input.unitPriceMinor,
      discountType: l.input.discountType,
      discountValue: l.input.discountValue,
      taxTreatment: l.taxTreatment,
      grossMinor: r.grossMinor,
      discountMinor: r.discountMinor,
      netMinor: r.netMinor,
      taxMinor: r.taxMinor,
      totalMinor: r.totalMinor,
    };
    if (kind === 'quote') db.insert(quoteLines).values({ ...row, quoteId: documentId }).run();
    else db.insert(invoiceLines).values({ ...row, invoiceId: documentId }).run();
    for (const t of r.taxes) {
      const taxRow = {
        id: newId(),
        companyId,
        lineId,
        taxId: t.key,
        name: t.name,
        ratePpm: t.ratePpm,
        isCompound: t.isCompound,
        registrationNumber: t.registrationNumber ?? null,
        baseMinor: t.baseMinor,
        amountMinor: t.amountMinor,
      };
      if (kind === 'quote') db.insert(quoteLineTaxes).values(taxRow).run();
      else db.insert(invoiceLineTaxes).values(taxRow).run();
    }
  });
  if (kind === 'invoice') {
    for (const t of p.result.taxTotals) {
      db.insert(invoiceTaxTotals)
        .values({ id: newId(), companyId, invoiceId: documentId, taxId: t.key, name: t.name, ratePpm: t.ratePpm, isCompound: t.isCompound, registrationNumber: t.registrationNumber ?? null, baseMinor: t.baseMinor, amountMinor: t.amountMinor })
        .run();
    }
  }
}

export function readLines(db: DB, kind: Kind, companyId: string, documentId: string): DocumentLine[] {
  const lines =
    kind === 'quote'
      ? db.select().from(quoteLines).where(and(eq(quoteLines.companyId, companyId), eq(quoteLines.quoteId, documentId))).orderBy(asc(quoteLines.position)).all()
      : db.select().from(invoiceLines).where(and(eq(invoiceLines.companyId, companyId), eq(invoiceLines.invoiceId, documentId))).orderBy(asc(invoiceLines.position)).all();
  if (!lines.length) return [];
  const ids = lines.map((l) => l.id);
  const taxRows =
    kind === 'quote'
      ? db.select().from(quoteLineTaxes).where(inArray(quoteLineTaxes.lineId, ids)).all()
      : db.select().from(invoiceLineTaxes).where(inArray(invoiceLineTaxes.lineId, ids)).all();
  return lines.map(
    (l): DocumentLine => ({
      id: l.id,
      position: l.position,
      catalogItemId: l.catalogItemId,
      kind: l.kind,
      sku: l.sku,
      name: l.name,
      description: l.description,
      unit: l.unit,
      quantityMilli: l.quantityMilli,
      unitPriceMinor: l.unitPriceMinor,
      discountType: l.discountType,
      discountValue: l.discountValue,
      taxTreatment: l.taxTreatment,
      grossMinor: l.grossMinor,
      discountMinor: l.discountMinor,
      netMinor: l.netMinor,
      taxMinor: l.taxMinor,
      totalMinor: l.totalMinor,
      taxes: taxRows
        .filter((t) => t.lineId === l.id)
        .map((t) => ({ taxId: t.taxId, name: t.name, ratePpm: t.ratePpm, isCompound: t.isCompound, registrationNumber: t.registrationNumber, baseMinor: t.baseMinor, amountMinor: t.amountMinor })),
    }),
  );
}

/** Convertit les lignes stockées en entrées réutilisables (duplication, conversion devis → facture). */
export function linesToInput(lines: DocumentLine[]): LineInput[] {
  return lines.map((l) => ({
    catalogItemId: l.catalogItemId,
    kind: l.kind,
    sku: l.sku,
    name: l.name,
    description: l.description,
    unit: l.unit,
    quantityMilli: l.quantityMilli,
    unitPriceMinor: l.unitPriceMinor,
    discountType: l.discountType,
    discountValue: l.discountValue,
    taxTreatment: l.taxTreatment,
    taxIds: l.taxes.map((t) => t.taxId).filter((x): x is string => !!x),
  }));
}

/** Copie figée des informations client et entreprise au moment de l'envoi / de l'émission. */
export function snapshots(p: { client: typeof clients.$inferSelect; company: typeof companies.$inferSelect }) {
  const { notes: _n, createdAt: _c1, updatedAt: _u1, archivedAt: _a1, ...client } = p.client;
  const { createdAt: _c2, updatedAt: _u2, archivedAt: _a2, ...company } = p.company;
  return { clientSnapshot: client as Record<string, unknown>, companySnapshot: company as Record<string, unknown> };
}

export function loadSnapshotsFor(db: DB, companyId: string, clientId: string) {
  const company = db.select().from(companies).where(eq(companies.id, companyId)).get();
  const client = db.select().from(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, clientId))).get();
  if (!company || !client) throw notFound('Client');
  return snapshots({ client, company });
}
