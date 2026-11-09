import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDecimal, formatMoney, parseMoney, parseQuantity, parsePercent, percentToString } from '@im/shared/money';
import { useCurrencies } from '@/hooks/queries';

const LOCALES: Record<string, string> = { fr: 'fr-CA', en: 'en-CA' };

/** Formatage monétaire selon les décimales propres à chaque devise (XOF : 0, CAD/EUR : 2). */
export function useMoney() {
  const { i18n } = useTranslation();
  const currencies = useCurrencies();
  const minorUnits = useCallback((code: string) => currencies.data?.find((c) => c.code === code)?.minorUnits ?? 2, [currencies.data]);
  const fmt = useCallback(
    (minor: number, currency: string) => {
      try {
        return formatMoney(minor, currency, minorUnits(currency), LOCALES[i18n.language] ?? 'fr-CA');
      } catch {
        return `${formatDecimal(minor, minorUnits(currency))} ${currency}`;
      }
    },
    [i18n.language, minorUnits],
  );
  return { fmt, minorUnits };
}

/** Valeur saisie → unités mineures, ou null si invalide. */
export function tryParseMoney(input: string, minorUnits: number): number | null {
  try {
    return input.trim() === '' ? null : parseMoney(input, minorUnits);
  } catch {
    return null;
  }
}
export function tryParseQuantity(input: string): number | null {
  try {
    return input.trim() === '' ? null : parseQuantity(input);
  } catch {
    return null;
  }
}
export function tryParsePercent(input: string): number | null {
  try {
    return input.trim() === '' ? null : parsePercent(input);
  } catch {
    return null;
  }
}

/** Affichage éditable (virgule décimale à la française). */
export const minorToInput = (minor: number, minorUnits: number) => formatDecimal(minor, minorUnits).replace('.', ',');
export const qtyToInput = (milli: number) => formatDecimal(milli, 3).replace(/\.?0+$/, '').replace('.', ',');
export const ppmToInput = (ppm: number) => percentToString(ppm).replace('.', ',');

export function formatDate(iso: string, locale = 'fr-CA') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
