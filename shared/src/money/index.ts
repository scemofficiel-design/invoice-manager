/**
 * Arithmétique monétaire exacte.
 *
 * - Les montants sont des entiers en unités mineures de leur devise (centimes ; unités pour XOF).
 * - Les quantités sont des entiers en millièmes (1,5 → 1500).
 * - Les taux et pourcentages sont des entiers en parties par million (9,975 % → 99 750).
 * - Les calculs intermédiaires utilisent BigInt : aucun nombre flottant n'intervient.
 */

export const PPM = 1_000_000n;
export const QTY_SCALE = 1000n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Division entière arrondie au plus proche, demi-unité éloignée de zéro (arrondi commercial). */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division par zéro');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const q = abs / denominator;
  const r = abs % denominator;
  const rounded = r * 2n >= denominator ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Convertit un BigInt en number en vérifiant qu'il reste dans la plage des entiers sûrs. */
export function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError('Montant hors limites');
  }
  return Number(value);
}

export function assertMinor(value: number, label = 'montant'): void {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`${label} invalide : entier attendu`);
}

/**
 * Répartit `total` proportionnellement aux `weights` (méthode du plus fort reste) :
 * la somme des parts est exactement égale à `total`.
 */
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    if (total === 0n) return weights.map(() => 0n);
    throw new MoneyError('Répartition impossible sur des poids nuls');
  }
  const sign = total < 0n ? -1n : 1n;
  const absTotal = total * sign;
  const parts = weights.map((w) => (absTotal * w) / sum);
  const remainders = weights.map((w, i) => ({ i, r: (absTotal * w) % sum }));
  let left = absTotal - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (left <= 0n) break;
    parts[i] = parts[i]! + 1n;
    left -= 1n;
  }
  return parts.map((p) => p * sign);
}

const DECIMAL_RE = /^\s*(-)?(\d+)(?:[.,](\d+))?\s*$/;

/** Analyse une chaîne décimale (« 12,34 », « 12.3 ») en entier à `scale` décimales, sans flottant. */
export function parseDecimal(input: string, scale: number): number {
  const cleaned = input.replace(/[\s  ]/g, '');
  const m = DECIMAL_RE.exec(cleaned);
  if (!m) throw new MoneyError(`Nombre invalide : « ${input} »`);
  const [, neg, int, frac = ''] = m;
  if (frac.length > scale) throw new MoneyError(`Trop de décimales (maximum ${scale})`);
  const digits = BigInt(int! + frac.padEnd(scale, '0'));
  return toSafeNumber(neg ? -digits : digits);
}

/** Inverse de parseDecimal : entier à `scale` décimales → chaîne « 1234.50 ». */
export function formatDecimal(value: number, scale: number): string {
  assertMinor(value);
  const neg = value < 0;
  const s = Math.abs(value).toString().padStart(scale + 1, '0');
  const int = scale === 0 ? s : s.slice(0, -scale);
  const frac = scale === 0 ? '' : s.slice(-scale);
  return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
}

export const parseMoney = (input: string, minorUnits: number) => parseDecimal(input, minorUnits);
export const parseQuantity = (input: string) => parseDecimal(input, 3);
/** Pourcentage saisi (« 9,975 ») → ppm (99 750) : 1 % = 10 000 ppm, soit 4 décimales. */
export const parsePercent = (input: string) => parseDecimal(input, 4);

export function percentToString(ppm: number): string {
  return formatDecimal(ppm, 4).replace(/\.?0+$/, '');
}

/** Formatage localisé d'un montant en unités mineures, sans passer par un flottant inexact. */
export function formatMoney(minor: number, currency: string, minorUnits: number, locale = 'fr-CA'): string {
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  });
  // Intl accepte une chaîne décimale exacte (ES2023), évitant toute erreur de représentation.
  return fmt.format(formatDecimal(minor, minorUnits) as unknown as number);
}
