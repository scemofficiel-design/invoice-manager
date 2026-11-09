import { and, eq } from 'drizzle-orm';
import { DEFAULT_NUMBERING, DOC_TYPES, type DocType } from '@im/shared/constants';
import { formatDocumentNumber, periodKeyFor } from '@im/shared/numbering';
import type { NumberingSequence } from '@im/shared/types';
import type { DB } from '../../database/connection';
import { numberingSequences } from '../../database/schema';
import { badRequest, notFound } from '../../utils/errors';
import { nowIso, todayLocal } from '../../utils/time';

export function createDefaultSequences(db: DB, companyId: string): void {
  const now = nowIso();
  for (const docType of DOC_TYPES) {
    db.insert(numberingSequences)
      .values({ companyId, docType, pattern: DEFAULT_NUMBERING[docType], reset: 'yearly', periodKey: periodKeyFor('yearly', todayLocal()), nextValue: 1, updatedAt: now })
      .run();
  }
}

export function listSequences(db: DB, companyId: string): NumberingSequence[] {
  const today = todayLocal();
  return db
    .select()
    .from(numberingSequences)
    .where(eq(numberingSequences.companyId, companyId))
    .all()
    .map((s) => {
      const next = s.periodKey === periodKeyFor(s.reset, today) ? s.nextValue : 1;
      return { docType: s.docType, pattern: s.pattern, reset: s.reset, periodKey: s.periodKey, nextValue: next, preview: formatDocumentNumber(s.pattern, today, next) };
    })
    .sort((a, b) => DOC_TYPES.indexOf(a.docType) - DOC_TYPES.indexOf(b.docType));
}

export function updateSequence(
  db: DB,
  companyId: string,
  docType: DocType,
  input: { pattern: string; reset: 'yearly' | 'never'; nextValue?: number | undefined },
) {
  const cur = db
    .select()
    .from(numberingSequences)
    .where(and(eq(numberingSequences.companyId, companyId), eq(numberingSequences.docType, docType)))
    .get();
  if (!cur) throw notFound('Séquence');
  const today = todayLocal();
  const periodKey = periodKeyFor(input.reset, today);
  const currentNext = cur.periodKey === periodKey ? cur.nextValue : 1;
  if (input.nextValue !== undefined && input.nextValue < currentNext) {
    // Revenir en arrière créerait des doublons ou des trous dans la séquence.
    throw badRequest('NUMBERING_DECREASE', `Le prochain numéro ne peut pas être inférieur à ${currentNext}`);
  }
  db.update(numberingSequences)
    .set({ pattern: input.pattern, reset: input.reset, periodKey, nextValue: input.nextValue ?? currentNext, updatedAt: nowIso() })
    .where(and(eq(numberingSequences.companyId, companyId), eq(numberingSequences.docType, docType)))
    .run();
  return { before: cur, after: { pattern: input.pattern, reset: input.reset, nextValue: input.nextValue ?? currentNext } };
}

/**
 * Attribue le prochain numéro. DOIT être appelée dans une transaction d'écriture : la séquence et le
 * document sont ainsi enregistrés ensemble (aucun trou si la transaction échoue).
 */
export function allocateNumber(db: DB, companyId: string, docType: DocType, date: string): string {
  const seq = db
    .select()
    .from(numberingSequences)
    .where(and(eq(numberingSequences.companyId, companyId), eq(numberingSequences.docType, docType)))
    .get();
  if (!seq) throw notFound('Séquence de numérotation');
  const periodKey = periodKeyFor(seq.reset, date);
  const value = seq.periodKey === periodKey ? seq.nextValue : 1;
  db.update(numberingSequences)
    .set({ periodKey, nextValue: value + 1, updatedAt: nowIso() })
    .where(and(eq(numberingSequences.companyId, companyId), eq(numberingSequences.docType, docType)))
    .run();
  return formatDocumentNumber(seq.pattern, date, value);
}
