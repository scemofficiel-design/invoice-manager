import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { companyInput, makeApp, setupOwner, type Client, type TestCtx } from '../test/helpers';
import { addDays, todayLocal } from '../utils/time';

let ctx: TestCtx;
let c: Client;
let cid: string;
let clientId: string;
let taxIds: string[];
const today = todayLocal();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(async () => {
  ctx = await makeApp();
  c = await setupOwner(ctx.app);
  cid = (await c.post('/companies', companyInput('Studio PDF', { addressLine1: '1 rue Test', city: 'Montréal', legalIds: [{ label: 'NEQ', value: '123' }] }))).json().id;
  await c.put(`/companies/${cid}/logo`, { dataUrl: PNG });
  taxIds = (await c.get(`/companies/${cid}/taxes`)).json().map((t: { id: string }) => t.id);
  clientId = (await c.post(`/companies/${cid}/clients`, { name: 'Client PDF', city: 'Laval' })).json().id;
});
afterEach(() => ctx.close());

const body = (n = 1) => ({
  clientId,
  currency: 'CAD',
  issueDate: today,
  dueDate: addDays(today, 30),
  terms: 'Paiement à 30 jours',
  lines: Array.from({ length: n }, (_, i) => ({ name: `Prestation ${i + 1}`, description: 'Détail', quantityMilli: 1000, unitPriceMinor: 10000, taxIds, discountType: i === 0 ? 'percent' : null, discountValue: i === 0 ? 50_000 : null })),
});
const pages = (buf: Buffer) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const getPdf = (path: string) => ctx.app.inject({ method: 'GET', url: `/api/v1${path}`, headers: { cookie: `im_session=${c.cookie}` } });

describe('PDF', () => {
  it('devis : PDF valide avec filigrane brouillon tant qu’il n’est pas envoyé', async () => {
    const q = (await c.post(`/companies/${cid}/quotes`, { ...body(), validUntil: addDays(today, 30) })).json();
    const r = await getPdf(`/companies/${cid}/quotes/${q.id}/pdf`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.headers['content-disposition']).toContain(`${q.number}.pdf`);
    const dl = await getPdf(`/companies/${cid}/quotes/${q.id}/pdf?download=1`);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('facture émise : PDF archivé à l’émission, identique à chaque lecture', async () => {
    const d = (await c.post(`/companies/${cid}/invoices`, body(2))).json();
    const draft = await getPdf(`/companies/${cid}/invoices/${d.id}/pdf`);
    expect(draft.headers['x-archived']).toBe('0');
    const inv = (await c.post(`/companies/${cid}/invoices/${d.id}/issue`)).json();
    const dir = join(ctx.dataDir, 'documents', 'companies', cid, 'invoices', today.slice(0, 4));
    expect(readdirSync(dir)).toEqual([`${inv.number}.pdf`]);
    const a = await getPdf(`/companies/${cid}/invoices/${d.id}/pdf`);
    const b = await getPdf(`/companies/${cid}/invoices/${d.id}/pdf`);
    expect(a.headers['x-archived']).toBe('1');
    expect(a.rawPayload.equals(b.rawPayload)).toBe(true);
    // un paiement ultérieur ne modifie pas le PDF original archivé
    await c.post(`/companies/${cid}/payments`, { invoiceId: d.id, amountMinor: 1000, paymentDate: today, method: 'cash', idempotencyKey: crypto.randomUUID() });
    expect((await getPdf(`/companies/${cid}/invoices/${d.id}/pdf`)).rawPayload.equals(a.rawPayload)).toBe(true);
  });

  it('détecte une altération du PDF archivé', async () => {
    const d = (await c.post(`/companies/${cid}/invoices`, body())).json();
    const inv = (await c.post(`/companies/${cid}/invoices/${d.id}/issue`)).json();
    writeFileSync(join(ctx.dataDir, 'documents', 'companies', cid, 'invoices', today.slice(0, 4), `${inv.number}.pdf`), '%PDF-falsifié');
    const r = await getPdf(`/companies/${cid}/invoices/${d.id}/pdf`);
    expect(r.statusCode).toBe(500);
    expect(r.json().error.code).toBe('INTEGRITY_ERROR');
  });

  it('tableau multi-pages', async () => {
    const d = (await c.post(`/companies/${cid}/invoices`, body(80))).json();
    const r = await getPdf(`/companies/${cid}/invoices/${d.id}/pdf`);
    expect(pages(r.rawPayload)).toBeGreaterThanOrEqual(3);
  });

  it('reçu : archivé à l’enregistrement du paiement', async () => {
    const d = (await c.post(`/companies/${cid}/invoices`, body())).json();
    await c.post(`/companies/${cid}/invoices/${d.id}/issue`);
    const p = (await c.post(`/companies/${cid}/payments`, { invoiceId: d.id, amountMinor: 5000, paymentDate: today, method: 'cheque', reference: 'CHQ-1', idempotencyKey: crypto.randomUUID() })).json();
    const r = await getPdf(`/companies/${cid}/receipts/${p.receiptId}/pdf`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['x-archived']).toBe('1');
    expect(readdirSync(join(ctx.dataDir, 'documents', 'companies', cid, 'receipts', today.slice(0, 4)))).toEqual([`${p.receiptNumber}.pdf`]);
    // reçu annulé : rendu avec filigrane, non servi depuis l'archive
    await c.post(`/companies/${cid}/payments/${p.id}/void`, { reason: 'Erreur de saisie' });
    expect((await getPdf(`/companies/${cid}/receipts/${p.receiptId}/pdf`)).headers['x-archived']).toBe('0');
  });

  it('isolation : PDF d’une autre entreprise introuvable', async () => {
    const other = (await c.post('/companies', companyInput('Autre'))).json().id;
    const d = (await c.post(`/companies/${cid}/invoices`, body())).json();
    expect((await getPdf(`/companies/${other}/invoices/${d.id}/pdf`)).statusCode).toBe(404);
  });

  it('XOF et anglais', async () => {
    const x = (await c.post('/companies', companyInput('Dakar', { defaultCurrency: 'XOF', taxPreset: 'uemoa-18', defaultLocale: 'en' }))).json().id;
    const cl = (await c.post(`/companies/${x}/clients`, { name: 'Client' })).json().id;
    const tva = (await c.get(`/companies/${x}/taxes`)).json()[0].id;
    const d = (await c.post(`/companies/${x}/invoices`, { clientId: cl, currency: 'XOF', locale: 'en', issueDate: today, dueDate: today, lines: [{ name: 'Service', quantityMilli: 1000, unitPriceMinor: 5000, taxIds: [tva] }] })).json();
    expect((await getPdf(`/companies/${x}/invoices/${d.id}/pdf`)).statusCode).toBe(200);
  });
});
