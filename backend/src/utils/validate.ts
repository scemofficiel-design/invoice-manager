import type { z } from 'zod';
import { badRequest } from './errors';

/** Valide une entrée avec un schéma Zod ; lève une erreur 400 normalisée en cas d'échec. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw badRequest(
      'VALIDATION_ERROR',
      'Données invalides',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}
