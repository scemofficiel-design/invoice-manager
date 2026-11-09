/**
 * Recherche globale sur toutes les entreprises accessibles à l'utilisateur (jamais au-delà).
 * Insensible à la casse et aux accents (im_norm), requêtes paramétrées. Pour les volumes d'une
 * application locale (quelques dizaines de milliers de documents), un balayage indexé suffit.
 */
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { catalogItems, clients, invoices, payments, quotes } from '../../database/schema';
import { requireAuth } from '../../middleware/auth';
import { searchAny } from '../../utils/search';
import { parse } from '../../utils/validate';
import { listCompaniesForUser } from '../companies/service';

export interface SearchResult {
  type: 'client' | 'catalog' | 'quote' | 'invoice' | 'payment';
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/search', { preHandler: requireAuth }, async (req): Promise<SearchResult[]> => {
    // Lu à chaque requête : la connexion peut être remplacée par une restauration.
    const { db } = app.conn;
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(100) }), req.query);
    const companies = listCompaniesForUser(app.conn, req.user!);
    if (!companies.length) return [];
    const ids = companies.map((c) => c.id);
    const name = new Map(companies.map((c) => [c.id, c.tradeName || c.legalName]));
    const L = 8;
    const out: SearchResult[] = [];
    const push = (r: Omit<SearchResult, 'companyName'>) => out.push({ ...r, companyName: name.get(r.companyId) ?? '' });

    for (const c of db.select().from(clients).where(and(inArray(clients.companyId, ids), searchAny(q, [clients.name, clients.contactName, clients.email, clients.phone]))).limit(L).all()) {
      push({ type: 'client', id: c.id, companyId: c.companyId, title: c.name, subtitle: [c.contactName, c.email].filter(Boolean).join(' · ') || null, href: `/c/${c.companyId}/clients/${c.id}` });
    }
    for (const i of db
      .select({ i: invoices, client: clients.name })
      .from(invoices)
      .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.companyId, invoices.companyId)))
      .where(and(inArray(invoices.companyId, ids), searchAny(q, [invoices.number, clients.name, invoices.notes])))
      .orderBy(desc(invoices.issueDate))
      .limit(L)
      .all()) {
      push({ type: 'invoice', id: i.i.id, companyId: i.i.companyId, title: i.i.number ?? 'Brouillon', subtitle: `${i.client} · ${i.i.issueDate}`, href: `/c/${i.i.companyId}/invoices/${i.i.id}` });
    }
    for (const x of db
      .select({ q: quotes, client: clients.name })
      .from(quotes)
      .innerJoin(clients, and(eq(clients.id, quotes.clientId), eq(clients.companyId, quotes.companyId)))
      .where(and(inArray(quotes.companyId, ids), searchAny(q, [quotes.number, clients.name, quotes.notes])))
      .orderBy(desc(quotes.issueDate))
      .limit(L)
      .all()) {
      push({ type: 'quote', id: x.q.id, companyId: x.q.companyId, title: x.q.number ?? '', subtitle: `${x.client} · ${x.q.issueDate}`, href: `/c/${x.q.companyId}/quotes/${x.q.id}` });
    }
    for (const it of db.select().from(catalogItems).where(and(inArray(catalogItems.companyId, ids), searchAny(q, [catalogItems.name, catalogItems.sku, catalogItems.category]))).limit(L).all()) {
      push({ type: 'catalog', id: it.id, companyId: it.companyId, title: it.name, subtitle: it.sku, href: `/c/${it.companyId}/catalog` });
    }
    for (const p of db.select().from(payments).where(and(inArray(payments.companyId, ids), searchAny(q, [payments.reference]))).limit(L).all()) {
      push({ type: 'payment', id: p.id, companyId: p.companyId, title: p.reference ?? '', subtitle: p.paymentDate, href: `/c/${p.companyId}/invoices/${p.invoiceId}` });
    }
    return out;
  });
}
