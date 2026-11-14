/** Moteur PDF Node (pdfmake serveur) — utilisé par le banc de test. */
import { createRequire } from 'node:module';
import PdfPrinter from 'pdfmake';
import type { PdfRenderer } from './renderer';

const require = createRequire(import.meta.url);
const vfsModule = require('pdfmake/build/vfs_fonts.js') as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;
const vfs: Record<string, string> = vfsModule.pdfMake?.vfs ?? vfsModule;
const font = (name: string) => Buffer.from(vfs[name]!, 'base64');

const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

export const nodePdfRenderer: PdfRenderer = (def) =>
  new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(def);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    doc.end();
  });
