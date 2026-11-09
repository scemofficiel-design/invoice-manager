/**
 * Moteur de calcul des documents commerciaux (devis, factures).
 *
 * Fonction pure, utilisée par le backend (calcul faisant foi) et par le frontend (aperçu en direct).
 * Toutes les valeurs sont des entiers (voir shared/money) ; les calculs internes utilisent BigInt.
 *
 * Ordre des opérations pour une ligne :
 *   brut = quantité × prix unitaire
 *   − remise de ligne
 *   − part de la remise document (répartie au prorata, méthode du plus fort reste)
 *   = net (base avant taxes)
 *   taxes simples = net × taux ; taxes composées = (net + taxes simples) × taux
 *
 * Mode « prix taxes incluses » : les montants saisis sont TTC ; le net HT est déduit ligne par ligne
 * et l'écart d'arrondi est absorbé par la plus grosse taxe pour que le TTC saisi reste exact.
 */
import { PPM, QTY_SCALE, MoneyError, allocate, roundDiv, toSafeNumber } from '../money/index';

export type TaxTreatment = 'taxable' | 'zero_rated' | 'exempt';
export type TaxRounding = 'per_line' | 'per_document';

export type Discount =
  | { type: 'percent'; valuePpm: number }
  | { type: 'amount'; valueMinor: number };

export interface TaxDefinition {
  /** Identifiant stable de la taxe (id en base ou clé de snapshot). */
  key: string;
  name: string;
  ratePpm: number;
  isCompound: boolean;
  registrationNumber?: string | null;
}

export interface LineInput {
  quantityMilli: number;
  unitPriceMinor: number;
  discount?: Discount | null;
  taxTreatment: TaxTreatment;
  taxes: TaxDefinition[];
}

export interface DocumentInput {
  lines: LineInput[];
  pricesIncludeTax: boolean;
  documentDiscount?: Discount | null;
  rounding: TaxRounding;
}

export interface LineTaxResult extends TaxDefinition {
  baseMinor: number;
  amountMinor: number;
}

export interface LineResult {
  grossMinor: number;
  lineDiscountMinor: number;
  documentDiscountMinor: number;
  /** Total des remises de la ligne (ligne + part document). */
  discountMinor: number;
  /** Base hors taxes après remises. */
  netMinor: number;
  taxes: LineTaxResult[];
  taxMinor: number;
  totalMinor: number;
}

export interface TaxTotal extends TaxDefinition {
  baseMinor: number;
  amountMinor: number;
}

export interface DocumentResult {
  amountsIncludeTax: boolean;
  lines: LineResult[];
  /** Somme des montants bruts (HT, ou TTC si amountsIncludeTax). */
  subtotalMinor: number;
  lineDiscountMinor: number;
  documentDiscountMinor: number;
  discountMinor: number;
  /** Somme des nets HT. */
  netMinor: number;
  /** Nets HT des lignes taxables portant au moins une taxe. */
  taxableBaseMinor: number;
  zeroRatedBaseMinor: number;
  exemptBaseMinor: number;
  /** Nets HT des lignes taxables sans aucune taxe. */
  untaxedBaseMinor: number;
  taxTotals: TaxTotal[];
  taxTotalMinor: number;
  totalMinor: number;
}

export class CalculationError extends MoneyError {
  constructor(message: string) {
    super(message);
    this.name = 'CalculationError';
  }
}

const big = (n: number) => BigInt(n);

function checkInt(n: number, label: string, min = 0) {
  if (!Number.isSafeInteger(n) || n < min) throw new CalculationError(`${label} invalide`);
}

function discountAmount(base: bigint, d: Discount | null | undefined, label: string): bigint {
  if (!d) return 0n;
  if (d.type === 'percent') {
    checkInt(d.valuePpm, `${label} (pourcentage)`);
    if (d.valuePpm > 1_000_000) throw new CalculationError(`${label} supérieure à 100 %`);
    return roundDiv(base * big(d.valuePpm), PPM);
  }
  checkInt(d.valueMinor, `${label} (montant)`);
  if (big(d.valueMinor) > base) throw new CalculationError(`${label} supérieure au montant`);
  return big(d.valueMinor);
}

function activeTaxes(line: LineInput): TaxDefinition[] {
  if (line.taxTreatment !== 'taxable') return [];
  const seen = new Set<string>();
  for (const t of line.taxes) {
    checkInt(t.ratePpm, `Taux de la taxe ${t.name}`);
    if (seen.has(t.key)) throw new CalculationError(`Taxe ${t.name} appliquée deux fois`);
    seen.add(t.key);
  }
  return line.taxes;
}

/** Taxes d'une ligne à partir de son net HT (montants exacts arrondis par taxe). */
function lineTaxes(net: bigint, taxes: TaxDefinition[]): { tax: TaxDefinition; base: bigint; amount: bigint }[] {
  const simple = taxes.filter((t) => !t.isCompound);
  const compound = taxes.filter((t) => t.isCompound);
  const out: { tax: TaxDefinition; base: bigint; amount: bigint }[] = [];
  let simpleSum = 0n;
  for (const t of simple) {
    const amount = roundDiv(net * big(t.ratePpm), PPM);
    simpleSum += amount;
    out.push({ tax: t, base: net, amount });
  }
  for (const t of compound) {
    const base = net + simpleSum;
    out.push({ tax: t, base, amount: roundDiv(base * big(t.ratePpm), PPM) });
  }
  return out;
}

export function computeDocument(input: DocumentInput): DocumentResult {
  const n = input.lines.length;

  // 1. Brut et remise de ligne
  const gross: bigint[] = [];
  const lineDisc: bigint[] = [];
  for (const [i, l] of input.lines.entries()) {
    checkInt(l.quantityMilli, `Quantité (ligne ${i + 1})`, 1);
    checkInt(l.unitPriceMinor, `Prix unitaire (ligne ${i + 1})`);
    const g = roundDiv(big(l.quantityMilli) * big(l.unitPriceMinor), QTY_SCALE);
    gross.push(g);
    lineDisc.push(discountAmount(g, l.discount, `Remise (ligne ${i + 1})`));
  }
  const afterLine = gross.map((g, i) => g - lineDisc[i]!);
  const afterLineSum = afterLine.reduce((a, b) => a + b, 0n);

  // 2. Remise document répartie au prorata
  const docDiscTotal = discountAmount(afterLineSum, input.documentDiscount, 'Remise globale');
  const docDisc = n > 0 ? allocate(docDiscTotal, afterLine) : [];
  const discounted = afterLine.map((a, i) => a - docDisc[i]!);

  // 3. Taxes
  const nets: bigint[] = new Array(n).fill(0n);
  const taxRows: { tax: TaxDefinition; base: bigint; amount: bigint }[][] = [];

  if (input.pricesIncludeTax) {
    // Montants TTC : on déduit le net HT par ligne, puis on ajuste la plus grosse taxe.
    for (let i = 0; i < n; i++) {
      const taxes = activeTaxes(input.lines[i]!);
      const ttc = discounted[i]!;
      if (taxes.length === 0) {
        nets[i] = ttc;
        taxRows.push([]);
        continue;
      }
      const s = taxes.filter((t) => !t.isCompound).reduce((a, t) => a + big(t.ratePpm), 0n);
      const c = taxes.filter((t) => t.isCompound).reduce((a, t) => a + big(t.ratePpm), 0n);
      const net = roundDiv(ttc * PPM * PPM, (PPM + s) * (PPM + c));
      const rows = lineTaxes(net, taxes);
      const residual = ttc - net - rows.reduce((a, r) => a + r.amount, 0n);
      if (residual !== 0n) {
        let maxIdx = 0;
        rows.forEach((r, k) => {
          if (r.amount > rows[maxIdx]!.amount) maxIdx = k;
        });
        rows[maxIdx]!.amount += residual;
      }
      nets[i] = net;
      taxRows.push(rows);
    }
  } else if (input.rounding === 'per_line') {
    for (let i = 0; i < n; i++) {
      nets[i] = discounted[i]!;
      taxRows.push(lineTaxes(discounted[i]!, activeTaxes(input.lines[i]!)));
    }
  } else {
    // per_document : bases cumulées par taxe, arrondi une seule fois, puis réparti sur les lignes.
    const lineTaxSets = input.lines.map((l) => activeTaxes(l));
    for (let i = 0; i < n; i++) nets[i] = discounted[i]!;
    const keys = new Map<string, TaxDefinition>();
    for (const set of lineTaxSets) for (const t of set) if (!keys.has(t.key)) keys.set(t.key, t);
    const rows: { tax: TaxDefinition; base: bigint; amount: bigint }[][] = lineTaxSets.map(() => []);

    // Taxes simples : montant exact (en millionièmes) cumulé, arrondi au niveau document.
    const exactSimplePerLine: bigint[] = new Array(n).fill(0n); // en unités mineures × PPM
    for (const tax of [...keys.values()].filter((t) => !t.isCompound)) {
      const idx = lineTaxSets.map((s, i) => (s.some((t) => t.key === tax.key) ? i : -1)).filter((i) => i >= 0);
      const exact = idx.map((i) => nets[i]! * big(tax.ratePpm));
      idx.forEach((i, k) => (exactSimplePerLine[i] = exactSimplePerLine[i]! + exact[k]!));
      const total = roundDiv(exact.reduce((a, b) => a + b, 0n), PPM);
      const shares = allocate(total, exact.some((e) => e > 0n) ? exact : idx.map(() => 1n));
      idx.forEach((i, k) => rows[i]!.push({ tax, base: nets[i]!, amount: total === 0n ? 0n : shares[k]! }));
    }
    for (const tax of [...keys.values()].filter((t) => t.isCompound)) {
      const idx = lineTaxSets.map((s, i) => (s.some((t) => t.key === tax.key) ? i : -1)).filter((i) => i >= 0);
      // base exacte = net + taxes simples exactes (en unités × PPM)
      const exactBase = idx.map((i) => nets[i]! * PPM + exactSimplePerLine[i]!);
      const exact = exactBase.map((b) => b * big(tax.ratePpm));
      const total = roundDiv(exact.reduce((a, b) => a + b, 0n), PPM * PPM);
      const shares = allocate(total, exact.some((e) => e > 0n) ? exact : idx.map(() => 1n));
      idx.forEach((i, k) =>
        rows[i]!.push({ tax, base: roundDiv(exactBase[k]!, PPM), amount: total === 0n ? 0n : shares[k]! }),
      );
    }
    taxRows.push(...rows);
  }

  // 4. Assemblage
  const lines: LineResult[] = [];
  const totals = new Map<string, TaxTotal>();
  let taxableBase = 0n;
  let zeroRated = 0n;
  let exempt = 0n;
  let untaxed = 0n;
  for (let i = 0; i < n; i++) {
    const l = input.lines[i]!;
    const rows = taxRows[i]!;
    const tax = rows.reduce((a, r) => a + r.amount, 0n);
    const net = nets[i]!;
    if (l.taxTreatment === 'exempt') exempt += net;
    else if (l.taxTreatment === 'zero_rated') zeroRated += net;
    else if (rows.length === 0) untaxed += net;
    else taxableBase += net;
    for (const r of rows) {
      const cur = totals.get(r.tax.key);
      if (cur) {
        cur.baseMinor += toSafeNumber(r.base);
        cur.amountMinor += toSafeNumber(r.amount);
      } else {
        totals.set(r.tax.key, { ...r.tax, baseMinor: toSafeNumber(r.base), amountMinor: toSafeNumber(r.amount) });
      }
    }
    lines.push({
      grossMinor: toSafeNumber(gross[i]!),
      lineDiscountMinor: toSafeNumber(lineDisc[i]!),
      documentDiscountMinor: toSafeNumber(docDisc[i]!),
      discountMinor: toSafeNumber(lineDisc[i]! + docDisc[i]!),
      netMinor: toSafeNumber(net),
      taxes: rows.map((r) => ({ ...r.tax, baseMinor: toSafeNumber(r.base), amountMinor: toSafeNumber(r.amount) })),
      taxMinor: toSafeNumber(tax),
      totalMinor: toSafeNumber(net + tax),
    });
  }

  const sum = (f: (l: LineResult) => number) => lines.reduce((a, l) => a + f(l), 0);
  const taxTotalMinor = sum((l) => l.taxMinor);
  const netMinor = sum((l) => l.netMinor);
  return {
    amountsIncludeTax: input.pricesIncludeTax,
    lines,
    subtotalMinor: sum((l) => l.grossMinor),
    lineDiscountMinor: sum((l) => l.lineDiscountMinor),
    documentDiscountMinor: sum((l) => l.documentDiscountMinor),
    discountMinor: sum((l) => l.discountMinor),
    netMinor,
    taxableBaseMinor: toSafeNumber(taxableBase),
    zeroRatedBaseMinor: toSafeNumber(zeroRated),
    exemptBaseMinor: toSafeNumber(exempt),
    untaxedBaseMinor: toSafeNumber(untaxed),
    taxTotals: [...totals.values()],
    taxTotalMinor,
    totalMinor: netMinor + taxTotalMinor,
  };
}
