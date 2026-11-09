import { or, sql, type AnyColumn, type SQL } from 'drizzle-orm';

/** Échappe les jokers LIKE saisis par l'utilisateur. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Recherche insensible à la casse et aux accents sur plusieurs colonnes (requête paramétrée :
 * la saisie n'est jamais concaténée dans le SQL).
 */
export function searchAny(q: string, columns: AnyColumn[]): SQL {
  const pattern = `%${escapeLike(q)}%`;
  return or(...columns.map((c) => sql`im_norm(${c}) LIKE im_norm(${pattern}) ESCAPE '\\'`))!;
}
