import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { companyInput, makeApp, setupOwner, Client, type TestCtx } from '../../test/helpers';
import { addDays, todayLocal } from '../../utils/time';
import { convertMinor } from './routes';

let ctx: TestCtx;
let c: Client;
const today = todayLocal();
beforeEach(async () => {
  ctx = await makeApp();
  c = await setupOwner(ctx.app);
});
afterEach(() => ctx.close());

async function companyWithInvoice(name: string, currency: string, preset: string, price: number, opts: { pay?: number; overdue?: boolean } = {}) {
  const id = (await c.post('/companies', companyInput(name, { defaultCurrency: currency, taxPreset: preset }))).json().id;
  const taxIds = (await c.get(`/companies/${id}/taxes`)).json().map((t: { id: string }) => t.id).slice(0, preset === 'fr' ? 1 : 2);
  const cl = (await c.post(`/companies/${id}/clients`, { name: `Client ${name}` })).json().id;
  const issue = opts.overdue ? addDays(today, -60) : today;
  const d = (await c.post(`/companies/${id}/invoices`, { clientId: cl, currency, issueDate: issue, dueDate: opts.overdue ? addDays(issue, 30) : addDays(today, 30), lines: [{ name: 'X', quantityMilli: 1000, unitPriceMinor: price, taxIds }] })).json();
  await c.post(`/companies/${id}/invoices/${d.id}/issue`);
  if (opts.pay) await c.post(`/companies/${id}/payments`, { invoiceId: d.id, amountMinor: opts.pay, paymentDate: today, method: 'cash', idempotencyKey: crypto.randomUUID() });
  await c.post(`/companies/${id}/quotes`, { clientId: cl, currency, issueDate: today, validUntil: addDays(today, 10), lines: [{ name: 'Q', quantityMilli: 1000, unitPriceMinor: 100, taxIds: [] }] }).then((r) => c.post(`/companies/${id}/quotes/${r.json().id}/send`));
  return id;
}

describe('tableaux de bord', () => {
  it('entreprise : CA HT, encaissé, en attente, taxes, top clients', async () => {
    const id = await companyWithInvoice('Nord', 'CAD', 'ca-qc', 10000, { pay: 4000 });
    const d = (await c.get(`/companies/${id}/dashboard`)).json();
    expect(d.totals).toEqual([{ currency: 'CAD', revenueMinor: 10000, invoicedTtcMinor: 11498, collectedMinor: 4000, outstandingMinor: 7498, overdueMinor: 0, taxMinor: 1498 }]);
    expect(d.counts).toMatchObject({ issued: 1, paid: 0, unpaid: 1, pendingQuotes: 1, activeClients: 1 });
    expect(d.taxes.map((t: { name: string; amount: number }) => [t.name, t.amount])).toEqual([['TPS', 500], ['TVQ', 998]]);
    expect(d.topClients[0]).toMatchObject({ name: 'Client Nord', revenue: 10000 });
    expect(d.monthly).toEqual([{ month: today.slice(0, 7), currency: 'CAD', revenue: 10000 }]);
  });

  it('général : jamais d’addition entre devises ; conversion explicite avec taux affiché', async () => {
    await companyWithInvoice('Nord', 'CAD', 'ca-qc', 10000);
    await companyWithInvoice('Paris', 'EUR', 'fr', 20000, { overdue: true });
    const d = (await c.get('/dashboard')).json();
    expect(d.companiesCount).toBe(2);
    expect(d.totals.map((t: { currency: string; revenueMinor: number }) => [t.currency, t.revenueMinor])).toEqual([['CAD', 10000], ['EUR', 20000]]);
    expect(d.totals.find((t: { currency: string }) => t.currency === 'EUR').overdueMinor).toBe(22000); // 200 € + TVA 10 %
    expect(d.converted).toBeNull();
    expect(d.byCompany).toHaveLength(2);

    const missing = (await c.get('/dashboard?reportCurrency=CAD')).json().converted;
    expect(missing).toMatchObject({ currency: 'CAD', revenueMinor: 10000, missing: ['EUR'] });

    await c.post('/exchange-rates', { baseCode: 'EUR', quoteCode: 'CAD', rate: '1.5', effectiveDate: addDays(today, -1) });
    const conv = (await c.get('/dashboard?reportCurrency=CAD')).json().converted;
    expect(conv).toMatchObject({ currency: 'CAD', revenueMinor: 40000, missing: [] });
    expect(conv.rates).toEqual([{ from: 'EUR', to: 'CAD', rate: '1.5', effectiveDate: addDays(today, -1), inverse: false }]);
    // taux inverse
    const inv = (await c.get('/dashboard?reportCurrency=EUR')).json().converted;
    expect(inv.revenueMinor).toBe(26667); // 20 000 + 10 000 / 1,5
  });

  it('les documents ne sont jamais modifiés par un taux de change', async () => {
    const id = await companyWithInvoice('Paris', 'EUR', 'fr', 20000);
    const before = (await c.get(`/companies/${id}/invoices`)).json()[0];
    await c.post('/exchange-rates', { baseCode: 'EUR', quoteCode: 'CAD', rate: '9.99', effectiveDate: today });
    const after = (await c.get(`/companies/${id}/invoices`)).json()[0];
    expect(after).toEqual(before);
  });

  it('un membre ne voit que les entreprises autorisées dans le consolidé', async () => {
    const a = await companyWithInvoice('A', 'CAD', 'ca-qc', 10000);
    await companyWithInvoice('B', 'CAD', 'ca-qc', 50000);
    const u = (await c.post('/admin/users', { displayName: 'M', email: 'm@test.local', password: 'membre12345' })).json();
    await c.put(`/companies/${a}/members`, { userId: u.id, role: 'viewer' });
    const m = new Client(ctx.app);
    await m.post('/auth/login', { email: 'm@test.local', password: 'membre12345' });
    const d = (await m.get('/dashboard')).json();
    expect(d.companiesCount).toBe(1);
    expect(d.totals[0].revenueMinor).toBe(10000);
  });

  it('conversion exacte', () => {
    expect(convertMinor(10000, '1.4925', false, 2, 2)).toBe(14925);
    expect(convertMinor(10000, '655.957', false, 2, 0)).toBe(65596); // 100 € → XOF (0 décimale)
    expect(convertMinor(65596, '655.957', true, 0, 2)).toBe(10000);
  });
});
