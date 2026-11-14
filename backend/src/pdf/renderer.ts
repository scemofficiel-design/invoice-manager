/**
 * Registre du moteur de rendu PDF. Les modèles (render.ts) produisent une définition pdfmake ;
 * l'environnement fournit le moteur : pdfmake Node (banc de test) ou pdfmake navigateur (iPhone).
 */
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

export type PdfRenderer = (def: TDocumentDefinitions) => Promise<Uint8Array>;
let current: PdfRenderer | null = null;

export function setPdfRenderer(r: PdfRenderer): void {
  current = r;
}

export function renderPdf(def: TDocumentDefinitions): Promise<Uint8Array> {
  if (!current) throw new Error('Aucun moteur PDF configuré');
  return current(def);
}
