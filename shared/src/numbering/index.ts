/**
 * Formatage des numéros de documents.
 * Variables : {YYYY} {YY} {MM} {SEQ} {SEQ:n} (n = nombre de chiffres, complété par des zéros).
 */
export function periodKeyFor(reset: 'yearly' | 'never', date: string): string {
  return reset === 'yearly' ? date.slice(0, 4) : 'all';
}

export function formatDocumentNumber(pattern: string, date: string, seq: number): string {
  const yyyy = date.slice(0, 4);
  const mm = date.slice(5, 7);
  return pattern
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{YY}', yyyy.slice(2))
    .replaceAll('{MM}', mm)
    .replace(/\{SEQ(?::(\d))?\}/g, (_, width?: string) => String(seq).padStart(width ? Number(width) : 1, '0'));
}
