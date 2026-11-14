/** Moteur PDF navigateur (pdfmake), chargé à la demande pour garder un démarrage léger. */
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

let maker: Promise<{ createPdf: (d: TDocumentDefinitions) => { getBuffer: (cb: (b: Uint8Array) => void) => void } }> | null = null;

async function load() {
  const [{ default: pdfMake }, fonts] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const f = (fonts as { default?: unknown }).default ?? fonts;
  const vfs = (f as { pdfMake?: { vfs: Record<string, string> } }).pdfMake?.vfs ?? (f as { vfs?: Record<string, string> }).vfs ?? (f as Record<string, string>);
  (pdfMake as unknown as { vfs: Record<string, string> }).vfs = vfs;
  return pdfMake as never;
}

export async function renderInBrowser(def: TDocumentDefinitions): Promise<Uint8Array> {
  maker ??= load();
  const pdfMake = await maker;
  return new Promise((resolve) => pdfMake.createPdf(def).getBuffer((b) => resolve(new Uint8Array(b))));
}
