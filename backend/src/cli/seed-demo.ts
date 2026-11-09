/**
 * Données de démonstration — profil « demo » UNIQUEMENT (base séparée, bandeau DÉMO dans l'interface).
 * Les données sont créées via l'API de l'application : elles respectent exactement les mêmes règles
 * métier (calculs, numérotation, snapshots, PDF archivés) que les données réelles.
 *
 *   npm run demo   → crée la base de démonstration si besoin, puis démarre l'application.
 */
import { CSRF_HEADER, SESSION_COOKIE } from '@im/shared/constants';
import { createApp } from '../app';
import { loadConfig } from '../config/index';
import { addDays, todayLocal } from '../utils/time';

export const DEMO_EMAIL = 'demo@demo.invoice-manager.test';
export const DEMO_PASSWORD = 'demo-invoice-2026';

const config = loadConfig({ profile: 'demo', autoBackup: false, logLevel: 'silent' });
if (config.profile !== 'demo') throw new Error('Profil démo requis');
const app = await createApp(config);
let cookie = '';

async function call<T = { id: string; number?: string; receiptId?: string }>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<T> {
  const r = await app.inject({ method, url: `/api/v1${url}`, payload: body as object, headers: { [CSRF_HEADER]: '1', ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}) } });
  const set = r.cookies.find((c) => c.name === SESSION_COOKIE);
  if (set?.value) cookie = set.value;
  if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
  return (r.body ? r.json() : undefined) as T;
}

try {
  const status = await call<{ setupRequired: boolean }>('GET', '/auth/status');
  if (!status.setupRequired) {
    console.log('La base de démonstration existe déjà.');
    process.exit(0);
  }
  console.log('Création des données de démonstration…');
  await call('POST', '/auth/setup', { organizationName: 'Organisation de démonstration', displayName: 'Compte démo', email: DEMO_EMAIL, password: DEMO_PASSWORD });

  const today = todayLocal();
  const monthsAgo = (n: number, day = 10) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return iso > today ? today : iso;
  };

  interface Spec {
    company: Record<string, unknown>;
    activities: string[];
    clients: Record<string, unknown>[];
    catalog: { name: string; price: number; unit: string; kind: 'service' | 'product'; activity: number }[];
  }
  const specs: Spec[] = [
    {
      company: { legalName: 'Studio Nord inc. (démo)', tradeName: 'Studio Nord', defaultCurrency: 'CAD', taxPreset: 'ca-qc', addressLine1: '1200, rue Sainte-Catherine Ouest', city: 'Montréal', region: 'QC', postalCode: 'H3B 1K9', country: 'CA', phone: '514 555-0100', email: 'facturation@studionord.demo', legalIds: [{ label: 'NEQ', value: '1170000000 (fictif)' }], bankDetails: 'Banque Démo — transit 00001 — compte 1234567 (fictif)', defaultTerms: 'Paiement à 30 jours. Frais de 1,5 % par mois sur tout solde en retard.', legalFooter: 'Données de démonstration — document fictif' },
      activities: ['Formation', 'Conseil', 'Design'],
      clients: [
        { name: 'Boulangerie Saint-Jean (démo)', contactName: 'Marie Tremblay', city: 'Québec', country: 'CA', email: 'marie@boulangerie.demo' },
        { name: 'Clinique Horizon (démo)', contactName: 'Dr Paul Gagnon', city: 'Laval', country: 'CA', email: 'admin@horizon.demo' },
        { name: 'Coopérative Érable (démo)', city: 'Sherbrooke', country: 'CA', taxExempt: true, exemptionRef: 'EX-2026-042 (fictif)' },
        { type: 'individual', name: 'Julie Côté (démo)', city: 'Montréal', country: 'CA' },
      ],
      catalog: [
        { name: 'Atelier de formation (journée)', price: 120000, unit: 'day', kind: 'service', activity: 0 },
        { name: 'Accompagnement stratégique', price: 15000, unit: 'hour', kind: 'service', activity: 1 },
        { name: 'Identité visuelle', price: 350000, unit: 'flat', kind: 'service', activity: 2 },
        { name: 'Guide pratique imprimé', price: 2500, unit: 'unit', kind: 'product', activity: 0 },
      ],
    },
    {
      company: { legalName: 'Atelier Lumière SAS (démo)', defaultCurrency: 'EUR', taxPreset: 'fr', addressLine1: '12 rue de la Paix', city: 'Paris', postalCode: '75002', country: 'FR', legalIds: [{ label: 'SIRET', value: '000 000 000 00000 (fictif)' }], defaultLocale: 'fr', legalFooter: 'Données de démonstration — document fictif' },
      activities: ['Photographie', 'Édition'],
      clients: [
        { name: 'Galerie Montmartre (démo)', city: 'Paris', country: 'FR' },
        { name: 'Maison Durand (démo)', city: 'Lyon', country: 'FR' },
      ],
      catalog: [
        { name: 'Séance photo', price: 45000, unit: 'flat', kind: 'service', activity: 0 },
        { name: 'Retouche', price: 6000, unit: 'hour', kind: 'service', activity: 1 },
      ],
    },
    {
      company: { legalName: 'Teranga Services SARL (démo)', defaultCurrency: 'XOF', taxPreset: 'uemoa-18', city: 'Dakar', country: 'SN', legalIds: [{ label: 'NINEA', value: '000000000 (fictif)' }], legalFooter: 'Données de démonstration — document fictif' },
      activities: ['Maintenance'],
      clients: [{ name: 'Hôtel Almadies (démo)', city: 'Dakar', country: 'SN' }],
      catalog: [{ name: 'Contrat de maintenance mensuel', price: 250000, unit: 'month', kind: 'service', activity: 0 }],
    },
  ];

  for (const [si, spec] of specs.entries()) {
    const company = await call('POST', '/companies', spec.company);
    const cid = company.id;
    const cur = spec.company.defaultCurrency as string;
    const taxes = await call<{ id: string; name: string; isDefault: boolean }[]>('GET', `/companies/${cid}/taxes`);
    const taxIds = cur === 'EUR' ? taxes.filter((t) => t.name === 'TVA 20 %').map((t) => t.id) : taxes.map((t) => t.id);
    const acts: { id: string }[] = [];
    for (const a of spec.activities) acts.push(await call('POST', `/companies/${cid}/activities`, { name: a }));
    const items: { id: string; spec: Spec['catalog'][number] }[] = [];
    for (const it of spec.catalog) items.push({ ...(await call('POST', `/companies/${cid}/catalog`, { name: it.name, unitPriceMinor: it.price, currency: cur, unit: it.unit, kind: it.kind, activityId: acts[it.activity]!.id, taxIds })), spec: it });
    const clients: { id: string }[] = [];
    for (const c of spec.clients) clients.push(await call('POST', `/companies/${cid}/clients`, c));

    const line = (i: number, qty: number) => {
      const it = items[i % items.length]!;
      return { catalogItemId: it.id, kind: it.spec.kind, name: it.spec.name, unit: it.spec.unit, quantityMilli: qty, unitPriceMinor: it.spec.price, taxIds };
    };
    const nInvoices = si === 0 ? 14 : si === 1 ? 7 : 4;
    for (let k = 0; k < nInvoices; k++) {
      const months = nInvoices - 1 - k;
      const issue = monthsAgo(Math.min(months, 9), 5 + (k % 20));
      const client = clients[k % clients.length]!;
      const lines = [line(k, 1000 + (k % 3) * 500), ...(k % 2 ? [line(k + 1, 2000)] : [])];
      const inv = await call('POST', `/companies/${cid}/invoices`, { clientId: client.id, activityId: acts[k % acts.length]!.id, currency: cur, issueDate: issue, dueDate: addDays(issue, 30), paymentTerms: 'Net 30 jours', lines });
      if (k === nInvoices - 1) continue; // un brouillon
      const issued = await call<{ id: string; totalMinor: number; number: string }>('POST', `/companies/${cid}/invoices/${inv.id}/issue`);
      const payDate = addDays(issue, 12) > today ? today : addDays(issue, 12);
      if (k % 4 === 0 || k % 4 === 1) await call('POST', `/companies/${cid}/payments`, { invoiceId: issued.id, amountMinor: issued.totalMinor, paymentDate: payDate, method: k % 2 ? 'card' : 'bank_transfer', reference: `DEMO-${k}`, idempotencyKey: `demo-${si}-${k}` });
      else if (k % 4 === 2) await call('POST', `/companies/${cid}/payments`, { invoiceId: issued.id, amountMinor: Math.floor(issued.totalMinor / 2), paymentDate: payDate, method: 'cheque', idempotencyKey: `demo-${si}-${k}` });
    }
    // Devis dans différents statuts, dont un accepté et converti
    const q = (k: number, issue: string) => call('POST', `/companies/${cid}/quotes`, { clientId: clients[k % clients.length]!.id, currency: cur, issueDate: issue, validUntil: addDays(issue, 30), lines: [line(k, 1000)] });
    const q1 = await q(0, monthsAgo(0, 1));
    await call('POST', `/companies/${cid}/quotes/${q1.id}/send`);
    const q2 = await q(1, monthsAgo(0, 2));
    await call('POST', `/companies/${cid}/quotes/${q2.id}/send`);
    await call('POST', `/companies/${cid}/quotes/${q2.id}/accept`);
    await call('POST', `/companies/${cid}/quotes/${q2.id}/convert`);
    await q(2, today);
    const q4 = await q(3, monthsAgo(3, 3));
    await call('POST', `/companies/${cid}/quotes/${q4.id}/send`);
    await call('POST', `/companies/${cid}/quotes/${q4.id}/refuse`);
  }
  await call('POST', '/exchange-rates', { baseCode: 'EUR', quoteCode: 'CAD', rate: '1.4900', effectiveDate: monthsAgo(0, 1) });
  await call('POST', '/exchange-rates', { baseCode: 'EUR', quoteCode: 'XOF', rate: '655.957', effectiveDate: monthsAgo(0, 1) });

  console.log('\nBase de démonstration prête.');
  console.log(`  Identifiant : ${DEMO_EMAIL}`);
  console.log(`  Mot de passe : ${DEMO_PASSWORD}`);
  console.log(`  Données : ${config.dataDir} (séparées de vos données réelles)`);
} finally {
  await app.close();
}
