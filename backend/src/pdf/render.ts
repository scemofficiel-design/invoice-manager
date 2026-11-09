/**
 * Modèles PDF (devis, facture, reçu) générés localement avec pdfmake.
 * Polices embarquées (Roboto fournie par pdfmake) : aucun accès réseau.
 * Les modèles reçoivent des données déjà figées (snapshots) : le rendu d'un document émis est stable.
 */
import { createRequire } from 'node:module';
import PdfPrinter from 'pdfmake';
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import fr from '@im/shared/i18n/fr.json';
import en from '@im/shared/i18n/en.json';
import { formatDecimal, formatMoney, percentToString } from '@im/shared/money';
import type { DocumentLine, LegalId, TaxTotalRow } from '@im/shared/types';
import { taxLabel, unitLabel } from '@im/shared/units';

const require = createRequire(import.meta.url);
const vfsModule = require('pdfmake/build/vfs_fonts.js') as { pdfMake?: { vfs: Record<string, string> } } & Record<string, string>;
const vfs: Record<string, string> = vfsModule.pdfMake?.vfs ?? vfsModule;
const font = (name: string) => Buffer.from(vfs[name]!, 'base64');

const printer = new PdfPrinter({
  Roboto: {
    normal: font('Roboto-Regular.ttf'),
    bold: font('Roboto-Medium.ttf'),
    italics: font('Roboto-Italic.ttf'),
    bolditalics: font('Roboto-MediumItalic.ttf'),
  },
});

type Locale = 'fr' | 'en';
const DICTS = { fr: fr.pdf, en: en.pdf } as const;
const UNITS = { fr: fr.catalog.units, en: en.catalog.units } as const;
const METHODS = { fr: fr.payment.methods, en: en.payment.methods } as const;
type PdfKey = keyof typeof fr.pdf;

function tr(locale: Locale, key: PdfKey, vars: Record<string, string | number> = {}): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), DICTS[locale][key]);
}

const INTL: Record<Locale, string> = { fr: 'fr-CA', en: 'en-CA' };
const COLORS = { text: '#1f2330', muted: '#6b7080', line: '#e4e6ec', accent: '#4f46e5', soft: '#f5f6f9' };

export interface PartyInfo {
  name: string;
  tradeName?: string | null;
  contactName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  ids?: LegalId[];
}

export interface DocumentPdfInput {
  kind: 'quote' | 'invoice';
  locale: Locale;
  number: string | null;
  issueDate: string;
  secondDate: string;
  currency: string;
  minorUnits: number;
  seller: PartyInfo;
  buyer: PartyInfo;
  /** Logo en data URL (PNG ou JPEG). */
  logo: string | null;
  lines: DocumentLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxableBaseMinor: number;
  taxTotals: Pick<TaxTotalRow, 'name' | 'ratePpm' | 'amountMinor' | 'registrationNumber'>[];
  totalMinor: number;
  pricesIncludeTax: boolean;
  amountPaidMinor?: number;
  paymentTerms?: string | null;
  terms: string | null;
  notes: string | null;
  bankDetails: string | null;
  legalFooter: string | null;
  sourceQuoteNumber?: string | null;
  exemptionRef?: string | null;
  watermark: 'draft' | 'cancelled' | null;
}

export interface ReceiptPdfInput {
  locale: Locale;
  number: string;
  issueDate: string;
  currency: string;
  minorUnits: number;
  seller: PartyInfo;
  buyer: PartyInfo;
  /** Logo en data URL (PNG ou JPEG). */
  logo: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotalMinor: number;
  method: string;
  reference: string | null;
  amountMinor: number;
  balanceBeforeMinor: number;
  balanceAfterMinor: number;
  isFullPayment: boolean;
  legalFooter: string | null;
  void: boolean;
}

const fmtDate = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const money = (minor: number, cur: string, mu: number, locale: Locale) => {
  try {
    return formatMoney(minor, cur, mu, INTL[locale]);
  } catch {
    return `${formatDecimal(minor, mu)} ${cur}`;
  }
};
const pct = (ppm: number, locale: Locale) => `${locale === 'fr' ? percentToString(ppm).replace('.', ',') : percentToString(ppm)} %`;
const qty = (milli: number, locale: Locale) => {
  const s = formatDecimal(milli, 3).replace(/\.?0+$/, '');
  return locale === 'fr' ? s.replace('.', ',') : s;
};

function partyLines(p: PartyInfo): string[] {
  return [
    p.contactName ?? '',
    p.addressLine1 ?? '',
    p.addressLine2 ?? '',
    [p.postalCode, p.city].filter(Boolean).join(' '),
    [p.region, p.country].filter(Boolean).join(', '),
    [p.phone, p.email].filter(Boolean).join(' · '),
    p.website ?? '',
  ].filter((x) => x.trim());
}

function header(locale: Locale, title: string, meta: [string, string][], seller: PartyInfo, logo: string | null): Content {
  const identity: Content[] = [
    { text: seller.tradeName || seller.name, style: 'company' },
    ...(seller.tradeName ? [{ text: seller.name, style: 'muted' } as Content] : []),
    ...partyLines(seller).map((l) => ({ text: l, style: 'muted' }) as Content),
    ...(seller.ids?.length ? [{ text: seller.ids.map((i) => `${i.label} ${i.value}`).join(' · '), style: 'muted' } as Content] : []),
  ];
  return {
    columns: [
      {
        width: '*',
        stack: [...(logo ? [{ image: logo, fit: [140, 56], margin: [0, 0, 0, 8] } as Content] : []), ...identity],
      },
      {
        width: 'auto',
        stack: [
          { text: title, style: 'title', alignment: 'right' },
          {
            table: { body: meta.map(([k, v]) => [{ text: k, style: 'metaKey' }, { text: v, style: 'metaVal' }]) },
            layout: 'noBorders',
            margin: [0, 6, 0, 0],
          },
        ],
      },
    ],
    columnGap: 24,
  };
}

function base(content: Content[], opts: { locale: Locale; footer: string[]; watermark: string | null }): TDocumentDefinitions {
  return {
    pageSize: 'LETTER',
    pageMargins: [48, 48, 48, 72],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: COLORS.text, lineHeight: 1.2 },
    info: { creator: 'Invoice Manager', producer: 'Invoice Manager' },
    ...(opts.watermark ? { watermark: { text: opts.watermark, color: '#d33', opacity: 0.12, bold: true, fontSize: 80 } } : {}),
    styles: {
      company: { fontSize: 13, bold: true, margin: [0, 0, 0, 2] },
      title: { fontSize: 20, bold: true, color: COLORS.accent, characterSpacing: 1 },
      muted: { color: COLORS.muted },
      metaKey: { color: COLORS.muted, alignment: 'right' },
      metaVal: { bold: true, alignment: 'right' },
      label: { fontSize: 8, bold: true, color: COLORS.muted, characterSpacing: 0.6, margin: [0, 0, 0, 3] },
      th: { fontSize: 8, bold: true, color: COLORS.muted, fillColor: COLORS.soft },
      small: { fontSize: 8, color: COLORS.muted },
      total: { fontSize: 12, bold: true },
    },
    content,
    footer: (page: number, pages: number) => ({
      margin: [48, 16, 48, 0],
      stack: [
        ...opts.footer.filter(Boolean).map((t) => ({ text: t, style: 'small', alignment: 'center' }) as Content),
        { text: tr(opts.locale, 'page', { page, pages }), style: 'small', alignment: 'right', margin: [0, 4, 0, 0] },
      ],
    }),
  };
}

function render(def: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(def);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Recréé à chaque rendu : pdfmake annote les nœuds de contenu, ils ne doivent pas être partagés. */
const rule = (): Content => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 516, y2: 0, lineWidth: 0.6, lineColor: COLORS.line }], margin: [0, 14, 0, 14] });

export async function renderDocumentPdf(d: DocumentPdfInput): Promise<Buffer> {
  const L = d.locale;
  const m = (v: number) => money(v, d.currency, d.minorUnits, L);
  const meta: [string, string][] = [
    [tr(L, 'number'), d.number ?? tr(L, 'draft')],
    [tr(L, 'issueDate'), fmtDate(d.issueDate, L)],
    [d.kind === 'quote' ? tr(L, 'validUntil') : tr(L, 'dueDate'), fmtDate(d.secondDate, L)],
    [tr(L, 'currency'), d.currency],
    ...(d.sourceQuoteNumber ? [[tr(L, 'fromQuote'), d.sourceQuoteNumber] as [string, string]] : []),
  ];

  const anyDiscount = d.lines.some((l) => l.discountType);
  const widths = anyDiscount ? ['*', 40, 70, 50, 70, 70] : ['*', 40, 75, 85, 75];
  const head: TableCell[] = [
    { text: tr(L, 'description'), style: 'th' },
    { text: tr(L, 'qty'), style: 'th', alignment: 'right' },
    { text: tr(L, 'unitPrice'), style: 'th', alignment: 'right' },
    ...(anyDiscount ? [{ text: tr(L, 'discount'), style: 'th', alignment: 'right' } as TableCell] : []),
    { text: tr(L, 'taxes'), style: 'th' },
    { text: tr(L, 'amount'), style: 'th', alignment: 'right' },
  ];
  const rows: TableCell[][] = d.lines.map((l) => {
    const unit = l.unit && l.unit !== 'unit' ? ` ${unitLabel((UNITS[L] as Record<string, string>)[l.unit] ?? l.unit, l.quantityMilli, L)}` : '';
    const taxText =
      l.taxTreatment === 'exempt' ? tr(L, 'exempt') : l.taxTreatment === 'zero_rated' ? tr(L, 'zeroRated') : l.taxes.map((t) => t.name).join(', ') || '—';
    return [
      { stack: [{ text: l.name, bold: true }, ...(l.description ? [{ text: l.description, style: 'small' } as Content] : [])] },
      { text: `${qty(l.quantityMilli, L)}${unit}`, alignment: 'right' },
      { text: m(l.unitPriceMinor), alignment: 'right' },
      ...(anyDiscount
        ? [{ text: l.discountType === 'percent' ? pct(l.discountValue ?? 0, L) : l.discountType === 'amount' ? m(l.discountValue ?? 0) : '', alignment: 'right' } as TableCell]
        : []),
      { text: taxText, style: 'small' },
      { text: m(l.netMinor), alignment: 'right' },
    ];
  });

  const totalsBody: TableCell[][] = [
    [{ text: tr(L, 'subtotal'), style: 'muted' }, { text: m(d.subtotalMinor), alignment: 'right' }],
    ...(d.discountMinor ? [[{ text: tr(L, 'discounts'), style: 'muted' }, { text: m(-d.discountMinor), alignment: 'right' }] as TableCell[]] : []),
    [{ text: tr(L, 'taxableBase'), style: 'muted' }, { text: m(d.taxableBaseMinor), alignment: 'right' }],
    ...d.taxTotals.map((t) => [{ text: taxLabel(t.name, pct(t.ratePpm, L)), style: 'muted' }, { text: m(t.amountMinor), alignment: 'right' }] as TableCell[]),
    [
      { text: d.pricesIncludeTax ? tr(L, 'totalIncl') : tr(L, 'total'), style: 'total', margin: [0, 4, 0, 0] },
      { text: m(d.totalMinor), style: 'total', alignment: 'right', margin: [0, 4, 0, 0] },
    ],
    ...(d.kind === 'invoice' && d.amountPaidMinor
      ? [
          [{ text: tr(L, 'paid'), style: 'muted' }, { text: m(-d.amountPaidMinor), alignment: 'right' }] as TableCell[],
          [{ text: tr(L, 'balance'), bold: true }, { text: m(d.totalMinor - d.amountPaidMinor), bold: true, alignment: 'right' }] as TableCell[],
        ]
      : []),
  ];

  const regs = [...new Map(d.taxTotals.filter((t) => t.registrationNumber).map((t) => [t.name, `${t.name} ${tr(L, 'regNo', { no: t.registrationNumber! })}`])).values()];
  const text = (label: PdfKey, value: string | null | undefined): Content[] =>
    value ? [{ text: tr(L, label).toUpperCase(), style: 'label', margin: [0, 10, 0, 3] }, { text: value }] : [];

  const content: Content[] = [
    header(L, tr(L, d.kind), meta, d.seller, d.logo),
    rule(),
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: (d.kind === 'quote' ? tr(L, 'quoteFor') : tr(L, 'billTo')).toUpperCase(), style: 'label' },
            { text: d.buyer.name, bold: true, fontSize: 11 },
            ...partyLines(d.buyer).map((l) => ({ text: l, style: 'muted' }) as Content),
            ...(d.buyer.ids?.length ? [{ text: d.buyer.ids.map((i) => `${i.label} ${i.value}`).join(' · '), style: 'muted' } as Content] : []),
            ...(d.exemptionRef !== undefined && d.exemptionRef !== null ? [{ text: tr(L, 'exemptClient', { ref: d.exemptionRef || '—' }), style: 'small', margin: [0, 4, 0, 0] } as Content] : []),
          ],
        },
      ],
    },
    {
      margin: [0, 18, 0, 0],
      table: { headerRows: 1, widths, dontBreakRows: true, body: [head, ...rows] },
      layout: {
        hLineWidth: (i: number) => (i === 0 ? 0 : 0.6),
        vLineWidth: () => 0,
        hLineColor: () => COLORS.line,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
    },
    {
      margin: [0, 14, 0, 0],
      columns: [
        { width: '*', stack: [...text('paymentTerms', d.paymentTerms), ...text('terms', d.terms), ...text('notes', d.notes), ...text('bank', d.bankDetails)] },
        { width: 220, table: { widths: ['*', 'auto'], body: totalsBody }, layout: { hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length - (d.kind === 'invoice' && d.amountPaidMinor ? 3 : 1) ? 0.8 : 0), vLineWidth: () => 0, hLineColor: () => COLORS.text, paddingTop: () => 3, paddingBottom: () => 3 }, unbreakable: true },
      ],
      columnGap: 24,
    },
  ];
  return render(base(content, { locale: L, footer: [regs.join(' · '), d.legalFooter ?? ''], watermark: d.watermark ? tr(L, d.watermark) : null }));
}

export async function renderReceiptPdf(r: ReceiptPdfInput): Promise<Buffer> {
  const L = r.locale;
  const m = (v: number) => money(v, r.currency, r.minorUnits, L);
  const row = (k: string, v: string, bold = false): TableCell[] => [{ text: k, style: 'muted' }, { text: v, alignment: 'right', bold }];
  const content: Content[] = [
    header(L, tr(L, 'receipt'), [[tr(L, 'number'), r.number], [tr(L, 'issueDate'), fmtDate(r.issueDate, L)], [tr(L, 'currency'), r.currency]], r.seller, r.logo),
    rule(),
    { text: tr(L, 'receivedFrom').toUpperCase(), style: 'label' },
    { text: r.buyer.name, bold: true, fontSize: 11 },
    ...partyLines(r.buyer).map((l) => ({ text: l, style: 'muted' }) as Content),
    {
      margin: [0, 20, 0, 0],
      table: {
        widths: ['*', 'auto'],
        body: [
          row(tr(L, 'forInvoice'), `${r.invoiceNumber} — ${fmtDate(r.invoiceDate, L)}`),
          row(tr(L, 'total'), m(r.invoiceTotalMinor)),
          row(tr(L, 'method'), (METHODS[L] as Record<string, string>)[r.method] ?? r.method),
          ...(r.reference ? [row(tr(L, 'reference'), r.reference)] : []),
          row(tr(L, 'balanceBefore'), m(r.balanceBeforeMinor)),
          [{ text: tr(L, 'received'), style: 'total' }, { text: m(r.amountMinor), style: 'total', alignment: 'right' }],
          row(tr(L, 'balanceAfter'), m(r.balanceAfterMinor), true),
        ],
      },
      layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.6), vLineWidth: () => 0, hLineColor: () => COLORS.line, paddingTop: () => 7, paddingBottom: () => 7 },
    },
    { text: r.isFullPayment ? tr(L, 'full') : tr(L, 'partial'), margin: [0, 14, 0, 0], bold: true, color: r.isFullPayment ? '#15803d' : '#b45309' },
  ];
  return render(base(content, { locale: L, footer: [r.legalFooter ?? ''], watermark: r.void ? tr(L, 'void') : null }));
}
