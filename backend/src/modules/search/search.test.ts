import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, companyInput, makeApp, setupOwner, type TestCtx } from '../../test/helpers';
import { addDays, todayLocal } from '../../utils/time';

let ctx: TestCtx;
let c: Client;
beforeEach(async () => {
  ctx = await makeApp();
  c = await setupOwner(ctx.app);
});
afterEach(() => ctx.close());

describe('recherche globale', () => {
  it('trouve clients et documents, sans accents, et respecte les droits', async () => {
    const a = (await c.post('/companies', companyInput('A'))).json().id;
    const b = (await c.post('/companies', companyInput('B'))).json().id;
    const cl = (await c.post(`/companies/${a}/clients`, { name: 'Pâtisserie Éloïse' })).json().id;
    await c.post(`/companies/${b}/clients`, { name: 'Patisserie Secrète' });
    const today = todayLocal();
    const d = (await c.post(`/companies/${a}/invoices`, { clientId: cl, currency: 'CAD', issueDate: today, dueDate: addDays(today, 5), lines: [{ name: 'X', quantityMilli: 1000, unitPriceMinor: 100 }] })).json();
    const inv = (await c.post(`/companies/${a}/invoices/${d.id}/issue`)).json();

    const r = (await c.get('/search?q=patisserie')).json();
    expect(r.filter((x: { type: string }) => x.type === 'client').map((x: { title: string }) => x.title).sort()).toEqual(['Patisserie Secrète', 'Pâtisserie Éloïse']);
    expect(r.some((x: { type: string; title: string }) => x.type === 'invoice' && x.title === inv.number)).toBe(true);
    expect((await c.get(`/search?q=${inv.number}`)).json()[0]).toMatchObject({ type: 'invoice', href: `/c/${a}/invoices/${d.id}` });

    const u = (await c.post('/admin/users', { displayName: 'M', email: 'm@test.local', password: 'membre12345' })).json();
    await c.put(`/companies/${b}/members`, { userId: u.id, role: 'viewer' });
    const m = new Client(ctx.app);
    await m.post('/auth/login', { email: 'm@test.local', password: 'membre12345' });
    const mr = (await m.get('/search?q=patisserie')).json();
    expect(mr.map((x: { title: string }) => x.title)).toEqual(['Patisserie Secrète']);
  });

  it('les jokers SQL saisis sont traités comme du texte', async () => {
    const a = (await c.post('/companies', companyInput('A'))).json().id;
    await c.post(`/companies/${a}/clients`, { name: 'Alpha' });
    expect((await c.get('/search?q=%25%25')).json()).toEqual([]);
    expect((await c.get('/search?q=a')).statusCode).toBe(400);
  });
});
