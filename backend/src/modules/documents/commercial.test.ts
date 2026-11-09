/** Parcours commercial complet : clients, catalogue, devis, conversion, factures, paiements, reçus. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, companyInput, makeApp, setupOwner, type TestCtx } from '../../test/helpers';
import { todayLocal, addDays } from '../../utils/time';

let ctx: TestCtx;
let c: Client;
let cid: string;
let tps: string;
let tvq: string;
let clientId: string;
const today = todayLocal();
const year = today.slice(0, 4);

beforeEach(async () => {
  ctx = await makeApp();
  c = await setupOwner(ctx.app);
  cid = (await c.post('/companies', companyInput('Studio'))).json().id;
  const taxes = (await c.get(`/companies/${cid}/taxes`)).json();
  tps = taxes.find((t: { name: string }) => t.name === 'TPS').id;
  tvq = taxes.find((t: { name: string }) => t.name === 'TVQ').id;
  clientId = (await c.post(`/companies/${cid}/clients`, { name: 'Client Alpha', email: 'alpha@client.test', country: 'CA' })).json().id;
});
afterEach(() => ctx.close());

const line = (o: Record<string, unknown> = {}) => ({ name: 'Conseil', quantityMilli: 1000, unitPriceMinor: 10000, taxIds: [tps, tvq], ...o });
const quoteBody = (o: Record<string, unknown> = {}) => ({ clientId, currency: 'CAD', issueDate: today, validUntil: addDays(today, 30), lines: [line()], ...o });
const invoiceBody = (o: Record<string, unknown> = {}) => ({ clientId, currency: 'CAD', issueDate: today, dueDate: addDays(today, 30), lines: [line()], ...o });

async function issuedInvoice(o: Record<string, unknown> = {}) {
  const inv = (await c.post(`/companies/${cid}/invoices`, invoiceBody(o))).json();
  return (await c.post(`/companies/${cid}/invoices/${inv.id}/issue`)).json();
}
const pay = (invoiceId: string, amountMinor: number, key = crypto.randomUUID(), o: Record<string, unknown> = {}) =>
  c.post(`/companies/${cid}/payments`, { invoiceId, amountMinor, paymentDate: today, method: 'bank_transfer', idempotencyKey: key, ...o });

describe('clients', () => {
  it('création, recherche, modification, archivage', async () => {
    await c.post(`/companies/${cid}/clients`, { type: 'individual', name: 'Bob Martin', city: 'Québec' });
    expect((await c.get(`/companies/${cid}/clients?q=queb`)).json().map((x: { name: string }) => x.name)).toEqual(['Bob Martin']);
    expect((await c.patch(`/companies/${cid}/clients/${clientId}`, { phone: '514-555-0000' })).json().phone).toBe('514-555-0000');
    await c.post(`/companies/${cid}/clients/${clientId}/archive`);
    expect((await c.get(`/companies/${cid}/clients`)).json()).toHaveLength(1);
    expect((await c.post(`/companies/${cid}/clients`, { name: '' })).statusCode).toBe(400);
  });

  it('un document ne peut pas viser un client archivé ou d’une autre entreprise', async () => {
    const other = (await c.post('/companies', companyInput('Autre'))).json().id;
    const foreign = (await c.post(`/companies/${other}/clients`, { name: 'Étranger' })).json().id;
    expect((await c.post(`/companies/${cid}/invoices`, invoiceBody({ clientId: foreign }))).json().error.code).toBe('INVALID_CLIENT');
    expect((await c.get(`/companies/${cid}/clients/${foreign}`)).statusCode).toBe(404);
    await c.post(`/companies/${cid}/clients/${clientId}/archive`);
    expect((await c.post(`/companies/${cid}/invoices`, invoiceBody())).json().error.code).toBe('CLIENT_ARCHIVED');
  });
});

describe('catalogue', () => {
  it('article avec taxes ; changement de prix sans effet rétroactif', async () => {
    const item = (await c.post(`/companies/${cid}/catalog`, { name: 'Atelier', sku: 'AT-1', unitPriceMinor: 50000, currency: 'CAD', unit: 'day', taxIds: [tps, tvq] })).json();
    expect(item.taxIds.sort()).toEqual([tps, tvq].sort());
    expect((await c.post(`/companies/${cid}/catalog`, { name: 'Doublon', sku: 'AT-1', unitPriceMinor: 1, currency: 'CAD' })).statusCode).toBe(409);
    const inv = (await c.post(`/companies/${cid}/invoices`, invoiceBody({ lines: [line({ catalogItemId: item.id, name: 'Atelier', unitPriceMinor: 50000 })] }))).json();
    await c.patch(`/companies/${cid}/catalog/${item.id}`, { unitPriceMinor: 99900 });
    const again = (await c.get(`/companies/${cid}/invoices/${inv.id}`)).json();
    expect(again.lines[0].unitPriceMinor).toBe(50000);
    expect(again.totalMinor).toBe(57488); // 500 $ + TPS 25 $ + TVQ 49,88 $
  });

  it('refuse un article dans une autre devise que le document', async () => {
    const eur = (await c.post(`/companies/${cid}/catalog`, { name: 'Licence', unitPriceMinor: 1000, currency: 'EUR' })).json();
    const r = await c.post(`/companies/${cid}/invoices`, invoiceBody({ lines: [line({ catalogItemId: eur.id })] }));
    expect(r.json().error.code).toBe('CURRENCY_MISMATCH');
  });

  it('refuse une taxe d’une autre entreprise', async () => {
    const other = (await c.post('/companies', companyInput('Autre'))).json().id;
    const foreignTax = (await c.get(`/companies/${other}/taxes`)).json()[0].id;
    expect((await c.post(`/companies/${cid}/catalog`, { name: 'X', unitPriceMinor: 1, currency: 'CAD', taxIds: [foreignTax] })).json().error.code).toBe('INVALID_TAX');
    expect((await c.post(`/companies/${cid}/invoices`, invoiceBody({ lines: [line({ taxIds: [foreignTax] })] }))).json().error.code).toBe('INVALID_TAX');
  });
});

describe('devis', () => {
  it('numérotation, calculs faisant foi et totaux ignorés côté client', async () => {
    const q = (await c.post(`/companies/${cid}/quotes`, quoteBody({ totalMinor: 1, lines: [line(), line({ quantityMilli: 2500, unitPriceMinor: 8000, discountType: 'percent', discountValue: 100_000 })] }))).json();
    expect(q.number).toBe(`DEV-${year}-0001`);
    // 100 + 2,5 × 80 − 10 % = 280 ; TPS 14 ; TVQ 27,93 → 321,93
    expect(q).toMatchObject({ status: 'draft', subtotalMinor: 30000, discountMinor: 2000, netMinor: 28000, taxTotalMinor: 4193, totalMinor: 32193 });
    expect(q.lines).toHaveLength(2);
    expect(q.lines[0].taxes.map((t: { name: string }) => t.name)).toEqual(['TPS', 'TVQ']);
    expect((await c.post(`/companies/${cid}/quotes`, quoteBody())).json().number).toBe(`DEV-${year}-0002`);
  });

  it('remise globale, client exonéré', async () => {
    const exempt = (await c.post(`/companies/${cid}/clients`, { name: 'Organisme exonéré', taxExempt: true, exemptionRef: 'EX-42' })).json().id;
    const q = (await c.post(`/companies/${cid}/quotes`, quoteBody({ clientId: exempt, docDiscountType: 'amount', docDiscountValue: 1000 }))).json();
    expect(q).toMatchObject({ discountMinor: 1000, taxTotalMinor: 0, totalMinor: 9000 });
    expect(q.lines[0].taxTreatment).toBe('exempt');
  });

  it('cycle de statut : modifiable seulement en brouillon', async () => {
    const q = (await c.post(`/companies/${cid}/quotes`, quoteBody())).json();
    expect((await c.put(`/companies/${cid}/quotes/${q.id}`, quoteBody({ notes: 'v2' }))).json().notes).toBe('v2');
    expect((await c.post(`/companies/${cid}/quotes/${q.id}/accept`)).statusCode).toBe(409);
    const sent = (await c.post(`/companies/${cid}/quotes/${q.id}/send`)).json();
    expect(sent.status).toBe('sent');
    expect(sent.clientSnapshot.name).toBe('Client Alpha');
    expect((await c.put(`/companies/${cid}/quotes/${q.id}`, quoteBody())).json().error.code).toBe('QUOTE_IMMUTABLE');
    expect((await c.post(`/companies/${cid}/quotes/${q.id}/refuse`)).json().status).toBe('refused');
    expect((await c.post(`/companies/${cid}/quotes/${q.id}/cancel`)).statusCode).toBe(409);
  });

  it('expiration dérivée et acceptation refusée après expiration', async () => {
    const past = addDays(today, -40);
    const q = (await c.post(`/companies/${cid}/quotes`, quoteBody({ issueDate: past, validUntil: addDays(past, 10) }))).json();
    const sent = (await c.post(`/companies/${cid}/quotes/${q.id}/send`)).json();
    expect(sent.displayStatus).toBe('expired');
    expect((await c.post(`/companies/${cid}/quotes/${q.id}/accept`)).json().error.code).toBe('QUOTE_EXPIRED');
    expect((await c.get(`/companies/${cid}/quotes?status=expired`)).json()).toHaveLength(1);
  });

  it('duplication', async () => {
    const q = (await c.post(`/companies/${cid}/quotes`, quoteBody())).json();
    await c.post(`/companies/${cid}/quotes/${q.id}/send`);
    const d = (await c.post(`/companies/${cid}/quotes/${q.id}/duplicate`)).json();
    expect(d).toMatchObject({ status: 'draft', duplicatedFromId: q.id, totalMinor: q.totalMinor, issueDate: today });
    expect(d.number).not.toBe(q.number);
  });

  it('refuse les dates incohérentes et les lignes invalides', async () => {
    expect((await c.post(`/companies/${cid}/quotes`, quoteBody({ validUntil: addDays(today, -1) }))).statusCode).toBe(400);
    expect((await c.post(`/companies/${cid}/quotes`, quoteBody({ lines: [line({ quantityMilli: 0 })] }))).statusCode).toBe(400);
    expect((await c.post(`/companies/${cid}/quotes`, quoteBody({ lines: [line({ discountType: 'amount', discountValue: 999999 })] }))).json().error.code).toBe('CALCULATION_ERROR');
  });
});

describe('conversion devis → facture', () => {
  it('conserve la référence et ne crée jamais de doublon', async () => {
    const q = (await c.post(`/companies/${cid}/quotes`, quoteBody())).json();
    expect((await c.post(`/companies/${cid}/quotes/${q.id}/convert`)).json().error.code).toBe('QUOTE_NOT_ACCEPTED');
    await c.post(`/companies/${cid}/quotes/${q.id}/send`);
    await c.post(`/companies/${cid}/quotes/${q.id}/accept`);
    const [r1, r2, r3] = await Promise.all([1, 2, 3].map(() => c.post(`/companies/${cid}/quotes/${q.id}/convert`)));
    const codes = [r1!, r2!, r3!].map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 200, 201]);
    const ids = new Set([r1!, r2!, r3!].map((r) => r.json().id));
    expect(ids.size).toBe(1);
    const inv = r1!.json();
    expect(inv).toMatchObject({ status: 'draft', number: null, sourceQuoteId: q.id, sourceQuoteNumber: q.number, totalMinor: q.totalMinor });
    expect((await c.get(`/companies/${cid}/invoices`)).json()).toHaveLength(1);
    expect((await c.get(`/companies/${cid}/quotes/${q.id}`)).json().invoiceId).toBe(inv.id);
    expect((await c.post(`/companies/${cid}/quotes/${q.id}/cancel`)).json().error.code).toBe('QUOTE_CONVERTED');
  });
});

describe('factures', () => {
  it('brouillon sans numéro, émission numérotée et figée', async () => {
    const d = (await c.post(`/companies/${cid}/invoices`, invoiceBody())).json();
    expect(d).toMatchObject({ status: 'draft', number: null, totalMinor: 11498, displayStatus: 'draft' });
    expect(d.taxTotals.map((t: { name: string; amountMinor: number }) => [t.name, t.amountMinor])).toEqual([['TPS', 500], ['TVQ', 998]]);
    const issued = (await c.post(`/companies/${cid}/invoices/${d.id}/issue`)).json();
    expect(issued).toMatchObject({ status: 'issued', number: `FAC-${year}-00001`, displayStatus: 'issued', balanceMinor: 11498 });
    expect(issued.clientSnapshot.name).toBe('Client Alpha');
    expect((await c.put(`/companies/${cid}/invoices/${d.id}`, invoiceBody())).json().error.code).toBe('INVOICE_IMMUTABLE');
    expect((await c.post(`/companies/${cid}/invoices/${d.id}/issue`)).statusCode).toBe(409);
    expect((await c.del(`/companies/${cid}/invoices/${d.id}`)).json().error.code).toBe('INVOICE_NO_DELETE');
  });

  it('instantané client : modifier le client ne change pas une facture émise', async () => {
    const inv = await issuedInvoice();
    await c.patch(`/companies/${cid}/clients/${clientId}`, { name: 'Client Alpha (renommé)' });
    const after = (await c.get(`/companies/${cid}/invoices/${inv.id}`)).json();
    expect(after.clientName).toBe('Client Alpha');
    expect(after.clientSnapshot.name).toBe('Client Alpha');
  });

  it('modifier une taxe ne change pas une facture existante', async () => {
    const inv = await issuedInvoice();
    await c.patch(`/companies/${cid}/taxes/${tvq}`, { ratePpm: 120_000 });
    const after = (await c.get(`/companies/${cid}/invoices/${inv.id}`)).json();
    expect(after.totalMinor).toBe(11498);
    expect(after.lines[0].taxes[1].ratePpm).toBe(99_750);
  });

  it('numérotation continue : les brouillons supprimés ne créent pas de trou', async () => {
    const d1 = (await c.post(`/companies/${cid}/invoices`, invoiceBody())).json();
    const d2 = (await c.post(`/companies/${cid}/invoices`, invoiceBody())).json();
    expect((await c.del(`/companies/${cid}/invoices/${d1.id}`)).statusCode).toBe(204);
    const i2 = (await c.post(`/companies/${cid}/invoices/${d2.id}/issue`)).json();
    const i3 = await issuedInvoice();
    expect([i2.number, i3.number]).toEqual([`FAC-${year}-00001`, `FAC-${year}-00002`]);
  });

  it('émission refusée pour une facture vide', async () => {
    const d = (await c.post(`/companies/${cid}/invoices`, invoiceBody({ lines: [] }))).json();
    expect((await c.post(`/companies/${cid}/invoices/${d.id}/issue`)).json().error.code).toBe('EMPTY_DOCUMENT');
  });

  it('annulation motivée et journalisée, duplication en nouveau brouillon', async () => {
    const inv = await issuedInvoice();
    expect((await c.post(`/companies/${cid}/invoices/${inv.id}/cancel`, { reason: '' })).statusCode).toBe(400);
    const cancelled = (await c.post(`/companies/${cid}/invoices/${inv.id}/cancel`, { reason: 'Erreur de destinataire' })).json();
    expect(cancelled).toMatchObject({ status: 'cancelled', displayStatus: 'cancelled', cancelReason: 'Erreur de destinataire', number: inv.number });
    const dup = (await c.post(`/companies/${cid}/invoices/${inv.id}/duplicate`)).json();
    expect(dup).toMatchObject({ status: 'draft', number: null, duplicatedFromId: inv.id, totalMinor: inv.totalMinor });
    const audit = (await c.get(`/admin/audit?companyId=${cid}`)).json();
    expect(audit.some((e: { action: string; summary: string }) => e.action === 'cancel' && e.summary.includes('Erreur de destinataire'))).toBe(true);
  });

  it('statut « en retard » dérivé de l’échéance', async () => {
    const past = addDays(today, -60);
    const inv = await issuedInvoice({ issueDate: past, dueDate: addDays(past, 30) });
    expect(inv.displayStatus).toBe('overdue');
    expect((await c.get(`/companies/${cid}/invoices?status=overdue`)).json()).toHaveLength(1);
  });

  it('un lecteur ne peut ni créer ni émettre', async () => {
    await c.post('/admin/users', { displayName: 'Lecteur', email: 'lecteur@test.local', password: 'lecteur12345' });
    const users = (await c.get('/admin/users')).json();
    const viewerId = users.find((u: { email: string }) => u.email === 'lecteur@test.local').id;
    await c.put(`/companies/${cid}/members`, { userId: viewerId, role: 'viewer' });
    const v = new Client(ctx.app);
    await v.post('/auth/login', { email: 'lecteur@test.local', password: 'lecteur12345' });
    expect((await v.get(`/companies/${cid}/invoices`)).statusCode).toBe(200);
    expect((await v.post(`/companies/${cid}/invoices`, invoiceBody())).statusCode).toBe(403);
  });
});

describe('paiements et reçus', () => {
  it('paiements partiels multiples, solde restant, reçus partiels puis intégral', async () => {
    const inv = await issuedInvoice();
    const p1 = await pay(inv.id, 5000);
    expect(p1.statusCode).toBe(201);
    expect(p1.json()).toMatchObject({ amountMinor: 5000, currency: 'CAD', receiptNumber: `REC-${year}-00001` });
    let after = (await c.get(`/companies/${cid}/invoices/${inv.id}`)).json();
    expect(after).toMatchObject({ amountPaidMinor: 5000, balanceMinor: 6498, displayStatus: 'partially_paid' });
    await pay(inv.id, 6498);
    after = (await c.get(`/companies/${cid}/invoices/${inv.id}`)).json();
    expect(after).toMatchObject({ amountPaidMinor: 11498, balanceMinor: 0, displayStatus: 'paid' });
    expect(after.payments).toHaveLength(2);
    const receipts = (await c.get(`/companies/${cid}/receipts`)).json();
    const byNumber = Object.fromEntries(receipts.map((r: { number: string }) => [r.number, r]));
    expect(byNumber[`REC-${year}-00001`]).toMatchObject({ amountMinor: 5000, balanceBeforeMinor: 11498, balanceAfterMinor: 6498, isFullPayment: false });
    expect(byNumber[`REC-${year}-00002`]).toMatchObject({ amountMinor: 6498, balanceAfterMinor: 0, isFullPayment: true });
    expect(byNumber[`REC-${year}-00002`].snapshot.invoice.number).toBe(inv.number);
    expect(byNumber[`REC-${year}-00002`].snapshot.client.name).toBe('Client Alpha');
  });

  it('refuse les paiements incohérents', async () => {
    const draft = (await c.post(`/companies/${cid}/invoices`, invoiceBody())).json();
    expect((await pay(draft.id, 100)).json().error.code).toBe('INVOICE_NOT_PAYABLE');
    const inv = await issuedInvoice();
    expect((await pay(inv.id, 11499)).json().error.code).toBe('AMOUNT_EXCEEDS_BALANCE');
    expect((await pay(inv.id, 0)).statusCode).toBe(400);
    expect((await pay(inv.id, 100, undefined, { currency: 'EUR' })).json().error.code).toBe('CURRENCY_MISMATCH');
    expect((await pay(inv.id, 100, undefined, { paymentDate: addDays(today, 3) })).json().error.code).toBe('INVALID_DATE');
    await pay(inv.id, 11498);
    expect((await pay(inv.id, 1)).json().error.code).toBe('INVOICE_PAID');
  });

  it('idempotence : un double envoi n’enregistre qu’un paiement', async () => {
    const inv = await issuedInvoice();
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([pay(inv.id, 3000, key), pay(inv.id, 3000, key)]);
    expect([a!.statusCode, b!.statusCode].sort()).toEqual([200, 201]);
    expect(a!.json().id).toBe(b!.json().id);
    expect((await c.get(`/companies/${cid}/invoices/${inv.id}`)).json().amountPaidMinor).toBe(3000);
  });

  it('annulation d’un paiement : solde restauré, reçu annulé, facture annulable ensuite', async () => {
    const inv = await issuedInvoice();
    const p = (await pay(inv.id, 4000)).json();
    expect((await c.post(`/companies/${cid}/invoices/${inv.id}/cancel`, { reason: 'Erreur' })).json().error.code).toBe('HAS_PAYMENTS');
    const voided = (await c.post(`/companies/${cid}/payments/${p.id}/void`, { reason: 'Chèque sans provision' })).json();
    expect(voided).toMatchObject({ status: 'voided', voidReason: 'Chèque sans provision' });
    expect((await c.get(`/companies/${cid}/invoices/${inv.id}`)).json()).toMatchObject({ amountPaidMinor: 0, displayStatus: 'issued' });
    expect((await c.get(`/companies/${cid}/receipts/${p.receiptId}`)).json().status).toBe('void');
    expect((await c.post(`/companies/${cid}/payments/${p.id}/void`, { reason: 'encore' })).json().error.code).toBe('ALREADY_VOIDED');
    expect((await c.post(`/companies/${cid}/invoices/${inv.id}/cancel`, { reason: 'Erreur' })).json().status).toBe('cancelled');
  });

  it('XOF : montants entiers sans décimales', async () => {
    const xof = (await c.post('/companies', companyInput('Dakar SARL', { defaultCurrency: 'XOF', taxPreset: 'uemoa-18' }))).json().id;
    const tva = (await c.get(`/companies/${xof}/taxes`)).json()[0].id;
    const cl = (await c.post(`/companies/${xof}/clients`, { name: 'Client Dakar' })).json().id;
    const d = (await c.post(`/companies/${xof}/invoices`, { clientId: cl, currency: 'XOF', issueDate: today, dueDate: today, lines: [{ name: 'Prestation', quantityMilli: 3000, unitPriceMinor: 3333, taxIds: [tva] }] })).json();
    expect(d.totalMinor).toBe(11799);
  });
});

describe('fiche client', () => {
  it('historique et soldes par devise, sans mélange', async () => {
    const inv = await issuedInvoice();
    await pay(inv.id, 1498);
    await c.post(`/companies/${cid}/quotes`, quoteBody());
    const eurInv = await issuedInvoice({ currency: 'EUR', lines: [line({ taxIds: [] })] });
    const detail = (await c.get(`/companies/${cid}/clients/${clientId}`)).json();
    expect(detail.quotes).toHaveLength(1);
    expect(detail.invoices).toHaveLength(2);
    expect(detail.payments).toHaveLength(1);
    const byCur = Object.fromEntries(detail.balances.map((b: { currency: string }) => [b.currency, b]));
    expect(byCur.CAD).toMatchObject({ invoicedMinor: 11498, paidMinor: 1498, dueMinor: 10000 });
    expect(byCur.EUR).toMatchObject({ invoicedMinor: eurInv.totalMinor, paidMinor: 0 });
  });
});
