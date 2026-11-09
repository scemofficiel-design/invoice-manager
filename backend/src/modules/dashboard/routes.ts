/**
 * Tableaux de bord. Règle absolue : les montants sont agrégés PAR DEVISE ; aucune addition entre
 * devises différentes. La vue convertie est optionnelle, utilise les taux saisis manuellement
 * (table exchange_rates) et expose le taux, sa date et la devise de référence.
 *
 * Définitions :
 *  - Chiffre d'affaires : somme HT (net) des factures émises (hors brouillons et annulées), par date d'émission.
 *  - Encaissé : paiements enregistrés (non annulés), par date de paiement.
 *  - En attente : solde restant des factures émises (toutes dates).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Sqlite } from '../../database/connection';
import { companyAccess, requireAuth } from '../../middleware/auth';
import { badRequest } from '../../utils/errors';
import { addDays, todayLocal } from '../../utils/time';
import { parse } from '../../utils/validate';
import { listCompaniesForUser } from '../companies/service';

export interface CurrencyTotals {
  currency: string;
  revenueMinor: number;
  invoicedTtcMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  taxMinor: number;
}

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reportCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
});

function period(q: { from?: string | undefined; to?: string | undefined }) {
  const to = q.to ?? todayLocal();
  const from = q.from ?? `${addDays(to, -365).slice(0, 7)}-01`;
  if (from > to) throw badRequest('INVALID_PERIOD', 'La date de début suit la date de fin');
  return { from, to };
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

/** Agrégats bruts pour un ensemble d'entreprises (requêtes paramétrées). */
function aggregate(sqlite: Sqlite, companyIds: string[], from: string, to: string) {
  if (!companyIds.length) return null;
  const ph = placeholders(companyIds.length);
  const today = todayLocal();
  const all = <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...companyIds, ...params) as T[];

  const totals = new Map<string, CurrencyTotals>();
  const get = (c: string) => {
    let t = totals.get(c);
    if (!t) totals.set(c, (t = { currency: c, revenueMinor: 0, invoicedTtcMinor: 0, collectedMinor: 0, outstandingMinor: 0, overdueMinor: 0, taxMinor: 0 }));
    return t;
  };
  for (const r of all<{ currency: string; net: number; total: number; tax: number }>(
    `SELECT currency, SUM(net_minor) net, SUM(total_minor) total, SUM(tax_total_minor) tax FROM invoices
     WHERE company_id IN (${ph}) AND status = 'issued' AND issue_date BETWEEN ? AND ? GROUP BY currency`, from, to)) {
    Object.assign(get(r.currency), { revenueMinor: r.net, invoicedTtcMinor: r.total, taxMinor: r.tax });
  }
  for (const r of all<{ currency: string; amount: number }>(
    `SELECT currency, SUM(amount_minor) amount FROM payments WHERE company_id IN (${ph}) AND status = 'recorded' AND payment_date BETWEEN ? AND ? GROUP BY currency`, from, to)) {
    get(r.currency).collectedMinor = r.amount;
  }
  const dueRows = sqlite
    .prepare(
      `SELECT currency, SUM(total_minor - amount_paid_minor) due,
              SUM(CASE WHEN due_date < ? THEN total_minor - amount_paid_minor ELSE 0 END) overdue
       FROM invoices WHERE company_id IN (${ph}) AND status = 'issued' GROUP BY currency`,
    )
    .all(today, ...companyIds) as { currency: string; due: number; overdue: number }[];
  for (const r of dueRows) {
    Object.assign(get(r.currency), { outstandingMinor: r.due, overdueMinor: r.overdue });
  }

  const counts = sqlite
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM invoices WHERE company_id IN (${ph}) AND status <> 'draft' AND issue_date BETWEEN ? AND ?) AS issued,
         (SELECT COUNT(*) FROM invoices WHERE company_id IN (${ph}) AND status = 'issued' AND amount_paid_minor >= total_minor AND issue_date BETWEEN ? AND ?) AS paid,
         (SELECT COUNT(*) FROM invoices WHERE company_id IN (${ph}) AND status = 'issued' AND amount_paid_minor < total_minor) AS unpaid,
         (SELECT COUNT(*) FROM invoices WHERE company_id IN (${ph}) AND status = 'issued' AND amount_paid_minor < total_minor AND due_date < ?) AS overdue,
         (SELECT COUNT(*) FROM quotes WHERE company_id IN (${ph}) AND issue_date BETWEEN ? AND ?) AS quotes,
         (SELECT COUNT(*) FROM quotes WHERE company_id IN (${ph}) AND status = 'sent' AND valid_until >= ?) AS pendingQuotes,
         (SELECT COUNT(DISTINCT client_id) FROM invoices WHERE company_id IN (${ph}) AND status = 'issued' AND issue_date BETWEEN ? AND ?) AS activeClients`,
    )
    .get(...companyIds, from, to, ...companyIds, from, to, ...companyIds, ...companyIds, today, ...companyIds, from, to, ...companyIds, today, ...companyIds, from, to) as Record<string, number>;

  const monthly = all<{ month: string; currency: string; revenue: number }>(
    `SELECT substr(issue_date, 1, 7) month, currency, SUM(net_minor) revenue FROM invoices
     WHERE company_id IN (${ph}) AND status = 'issued' AND issue_date BETWEEN ? AND ? GROUP BY month, currency ORDER BY month`, from, to);

  return { totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)), counts, monthly };
}

/** Taux applicable : le plus récent à la date donnée, direct ou inverse. Retourne num/den exacts. */
function findRate(sqlite: Sqlite, fromCur: string, toCur: string, date: string): { rate: string; date: string; inverse: boolean } | null {
  const direct = sqlite
    .prepare(`SELECT rate, effective_date d FROM exchange_rates WHERE base_code = ? AND quote_code = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1`)
    .get(fromCur, toCur, date) as { rate: string; d: string } | undefined;
  const inverse = sqlite
    .prepare(`SELECT rate, effective_date d FROM exchange_rates WHERE base_code = ? AND quote_code = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1`)
    .get(toCur, fromCur, date) as { rate: string; d: string } | undefined;
  if (direct && (!inverse || direct.d >= inverse.d)) return { rate: direct.rate, date: direct.d, inverse: false };
  if (inverse) return { rate: inverse.rate, date: inverse.d, inverse: true };
  return null;
}

function decimalToFraction(rate: string): { num: bigint; den: bigint } {
  const [int, frac = ''] = rate.split('.');
  return { num: BigInt(int! + frac), den: 10n ** BigInt(frac.length) };
}

/** Conversion exacte (BigInt) d'un montant en unités mineures vers une autre devise, arrondi commercial. */
export function convertMinor(amount: number, rate: string, inverse: boolean, fromMu: number, toMu: number): number {
  const { num, den } = decimalToFraction(rate);
  let n = BigInt(amount) * (inverse ? den : num) * 10n ** BigInt(toMu);
  let d = (inverse ? num : den) * 10n ** BigInt(fromMu);
  if (d < 0n) [n, d] = [-n, -d];
  const q = n / d;
  const r = n % d;
  return Number(r * 2n >= d ? q + 1n : q);
}

function converted(sqlite: Sqlite, totals: CurrencyTotals[], report: string, date: string) {
  const mus = new Map((sqlite.prepare('SELECT code, minor_units mu FROM currencies').all() as { code: string; mu: number }[]).map((c) => [c.code, c.mu]));
  if (!mus.has(report)) throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue : ${report}`);
  const rates: { from: string; to: string; rate: string; effectiveDate: string; inverse: boolean }[] = [];
  const missing: string[] = [];
  const sum = { revenueMinor: 0, collectedMinor: 0, outstandingMinor: 0 };
  for (const t of totals) {
    let conv: (v: number) => number;
    if (t.currency === report) conv = (v) => v;
    else {
      const r = findRate(sqlite, t.currency, report, date);
      if (!r) {
        missing.push(t.currency);
        continue;
      }
      rates.push({ from: t.currency, to: report, rate: r.rate, effectiveDate: r.date, inverse: r.inverse });
      conv = (v) => convertMinor(v, r.rate, r.inverse, mus.get(t.currency) ?? 2, mus.get(report) ?? 2);
    }
    sum.revenueMinor += conv(t.revenueMinor);
    sum.collectedMinor += conv(t.collectedMinor);
    sum.outstandingMinor += conv(t.outstandingMinor);
  }
  return { currency: report, ...sum, rates, missing };
}

export async function dashboardRoutes(app: FastifyInstance) {
  const { conn } = app;

  app.get('/companies/:companyId/dashboard', { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(querySchema, req.query);
    const { from, to } = period(q);
    const cid = req.company!.id;
    const agg = aggregate(conn.sqlite, [cid], from, to)!;
    const topClients = conn.sqlite
      .prepare(
        `SELECT c.id, c.name, i.currency, SUM(i.net_minor) revenue, COUNT(*) invoices FROM invoices i JOIN clients c ON c.id = i.client_id AND c.company_id = i.company_id
         WHERE i.company_id = ? AND i.status = 'issued' AND i.issue_date BETWEEN ? AND ? GROUP BY c.id, i.currency ORDER BY revenue DESC LIMIT 10`,
      )
      .all(cid, from, to);
    const taxes = conn.sqlite
      .prepare(
        `SELECT t.name, t.rate_ppm ratePpm, i.currency, SUM(t.amount_minor) amount FROM invoice_tax_totals t JOIN invoices i ON i.id = t.invoice_id AND i.company_id = t.company_id
         WHERE i.company_id = ? AND i.status = 'issued' AND i.issue_date BETWEEN ? AND ? GROUP BY t.name, t.rate_ppm, i.currency ORDER BY i.currency, t.name`,
      )
      .all(cid, from, to);
    return { from, to, ...agg, topClients, taxes };
  });

  app.get('/dashboard', { preHandler: requireAuth }, async (req) => {
    const q = parse(querySchema, req.query);
    const { from, to } = period(q);
    const companies = listCompaniesForUser(conn, req.user!).filter((c) => !c.archivedAt);
    const ids = companies.map((c) => c.id);
    const agg = aggregate(conn.sqlite, ids, from, to) ?? { totals: [], counts: {}, monthly: [] };
    const byCompany = companies.map((c) => ({ id: c.id, name: c.tradeName || c.legalName, totals: aggregate(conn.sqlite, [c.id], from, to)!.totals }));
    return {
      from,
      to,
      companiesCount: companies.length,
      ...agg,
      byCompany,
      converted: q.reportCurrency ? converted(conn.sqlite, agg.totals, q.reportCurrency, to) : null,
    };
  });
}
