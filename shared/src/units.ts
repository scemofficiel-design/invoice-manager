/** Libellé d'unité accordé en nombre (« 1,5 jour », « 3 jours » ; « 1 day », « 2 days »). */
export function unitLabel(singular: string, quantityMilli: number, locale: 'fr' | 'en'): string {
  const plural = locale === 'fr' ? quantityMilli >= 2000 : quantityMilli !== 1000;
  if (!plural || /km$/i.test(singular) || /[sxz]$/i.test(singular)) return singular;
  return locale === "en" ? singular.replace(/(\w+)$/, "$1s") : singular.replace(/^(\S+)/, "$1s");
}

/** Libellé d'une taxe : « TPS (5 %) », mais « TVA 20 % » si le nom contient déjà le taux. */
export function taxLabel(name: string, rateText: string): string {
  return /\d\s*%/.test(name) ? name : `${name} (${rateText})`;
}
