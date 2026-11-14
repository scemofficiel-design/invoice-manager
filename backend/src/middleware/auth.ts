import type { FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { COMPANY_ROLE_RANK, CSRF_HEADER, type CompanyRole } from '@im/shared/constants';
import { companies, userCompanyAccess } from '../database/schema';
import { forbidden, notFound, unauthorized } from '../utils/errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Protection CSRF : en plus du cookie SameSite=Strict, toute requête mutante doit porter l'en-tête
 * personnalisé (impossible à poser depuis un formulaire tiers) et une origine identique à l'hôte.
 */
export async function csrfGuard(req: FastifyRequest): Promise<void> {
  if (!MUTATING.has(req.method)) return;
  if (req.headers[CSRF_HEADER] !== '1') throw forbidden('Requête refusée (en-tête de sécurité manquant)');
  const origin = req.headers.origin;
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw forbidden('Origine invalide');
    }
    if (host !== req.headers.host) throw forbidden('Origine non autorisée');
  }
}

export async function requireAuth(req: FastifyRequest): Promise<void> {
  if (!req.user) throw unauthorized();
}

export async function requireOwner(req: FastifyRequest): Promise<void> {
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'owner') throw forbidden('Réservé au propriétaire');
}

/**
 * Vérifie l'accès à l'entreprise de l'URL (`:companyId`). Une entreprise inaccessible renvoie 404
 * pour ne pas révéler son existence. Le propriétaire a un rôle « admin » sur toutes les entreprises.
 */
export function companyAccess(minRole: CompanyRole) {
  return async (req: FastifyRequest): Promise<void> => {
    if (!req.user) throw unauthorized();
    const companyId = (req.params as { companyId?: string }).companyId;
    if (!companyId) throw notFound('Entreprise');
    const { db } = req.server.conn;
    let role: CompanyRole | null = null;
    if (req.user.role === 'owner') {
      role = db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get() ? 'admin' : null;
    } else {
      role =
        db
          .select({ role: userCompanyAccess.role })
          .from(userCompanyAccess)
          .where(and(eq(userCompanyAccess.userId, req.user.id), eq(userCompanyAccess.companyId, companyId)))
          .get()?.role ?? null;
    }
    if (!role) throw notFound('Entreprise');
    if (COMPANY_ROLE_RANK[role] < COMPANY_ROLE_RANK[minRole]) throw forbidden('Droits insuffisants pour cette entreprise');
    req.company = { id: companyId, role };
  };
}

/** Raccourci typé pour obtenir le scope entreprise validé par le middleware. */
export function scopeOf(req: FastifyRequest): { companyId: string; userId: string } {
  if (!req.company || !req.user) throw unauthorized();
  return { companyId: req.company.id, userId: req.user.id };
}
