import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq } from 'drizzle-orm';
import { currencyCreateSchema, currencyUpdateSchema, exchangeRateCreateSchema } from '@im/shared/schemas';
import type { Currency, ExchangeRate } from '@im/shared/types';
import { transaction } from '../../database/connection';
import { companies, currencies, exchangeRates } from '../../database/schema';
import { requireAuth, requireOwner } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';

const toCurrency = ({ createdAt: _c, ...r }: typeof currencies.$inferSelect): Currency => r;
const toRate = ({ createdBy: _b, ...r }: typeof exchangeRates.$inferSelect): ExchangeRate => r;

export async function currencyRoutes(app: FastifyInstance) {
  const { conn } = app;

  app.get('/currencies', { preHandler: requireAuth }, async () =>
    conn.db.select().from(currencies).orderBy(asc(currencies.code)).all().map(toCurrency),
  );

  app.post('/currencies', { preHandler: requireOwner }, async (req, reply) => {
    const input = parse(currencyCreateSchema, req.body);
    if (conn.db.select().from(currencies).where(eq(currencies.code, input.code)).get()) {
      throw conflict('CURRENCY_EXISTS', `La devise ${input.code} existe déjà`);
    }
    transaction(conn, () => {
      conn.db.insert(currencies).values({ ...input, isActive: true, createdAt: nowIso() }).run();
      recordAudit(conn.db, { userId: req.user!.id, action: 'create', entityType: 'currency', entityId: input.code, summary: `Devise ajoutée : ${input.code}` });
    });
    return reply.code(201).send(toCurrency(conn.db.select().from(currencies).where(eq(currencies.code, input.code)).get()!));
  });

  app.patch('/currencies/:code', { preHandler: requireOwner }, async (req) => {
    const code = (req.params as { code: string }).code.toUpperCase();
    const input = parse(currencyUpdateSchema, req.body);
    if (!conn.db.select().from(currencies).where(eq(currencies.code, code)).get()) throw notFound('Devise');
    if (input.isActive === false && conn.db.select({ id: companies.id }).from(companies).where(eq(companies.defaultCurrency, code)).get()) {
      throw badRequest('CURRENCY_IN_USE', 'Cette devise est la devise principale d’une entreprise');
    }
    transaction(conn, () => {
      conn.db.update(currencies).set(input).where(eq(currencies.code, code)).run();
      recordAudit(conn.db, { userId: req.user!.id, action: 'update', entityType: 'currency', entityId: code, summary: `Devise modifiée : ${code}`, changes: input });
    });
    return toCurrency(conn.db.select().from(currencies).where(eq(currencies.code, code)).get()!);
  });

  // ── Taux de change (rapports consolidés uniquement) ──
  app.get('/exchange-rates', { preHandler: requireAuth }, async () =>
    conn.db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate), asc(exchangeRates.baseCode)).all().map(toRate),
  );

  app.post('/exchange-rates', { preHandler: requireOwner }, async (req, reply) => {
    const input = parse(exchangeRateCreateSchema, req.body);
    if (input.baseCode === input.quoteCode) throw badRequest('SAME_CURRENCY', 'Les deux devises doivent être différentes');
    for (const code of [input.baseCode, input.quoteCode]) {
      if (!conn.db.select().from(currencies).where(eq(currencies.code, code)).get()) throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue : ${code}`);
    }
    if (Number(input.rate) <= 0) throw badRequest('INVALID_RATE', 'Le taux doit être strictement positif');
    const id = newId();
    transaction(conn, () => {
      conn.db.insert(exchangeRates).values({ ...input, id, createdBy: req.user!.id, createdAt: nowIso() }).run();
      recordAudit(conn.db, { userId: req.user!.id, action: 'create', entityType: 'exchange_rate', entityId: id, summary: `Taux ${input.baseCode}→${input.quoteCode} = ${input.rate} au ${input.effectiveDate}` });
    });
    return reply.code(201).send(toRate(conn.db.select().from(exchangeRates).where(eq(exchangeRates.id, id)).get()!));
  });

  app.delete('/exchange-rates/:id', { preHandler: requireOwner }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    transaction(conn, () => {
      const row = conn.db.select().from(exchangeRates).where(and(eq(exchangeRates.id, id))).get();
      if (!row) throw notFound('Taux');
      conn.db.delete(exchangeRates).where(eq(exchangeRates.id, id)).run();
      recordAudit(conn.db, { userId: req.user!.id, action: 'delete', entityType: 'exchange_rate', entityId: id, summary: `Taux supprimé : ${row.baseCode}→${row.quoteCode} au ${row.effectiveDate}`, changes: row });
    });
    return reply.code(204).send();
  });
}
