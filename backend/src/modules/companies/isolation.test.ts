import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, companyInput, makeApp, setupOwner, type TestCtx } from '../../test/helpers';
import { newId, nowIso } from '../../utils/time';

let ctx: TestCtx;
let owner: Client;
let a: { id: string };
let b: { id: string };
beforeEach(async () => {
  ctx = await makeApp();
  owner = await setupOwner(ctx.app);
  a = (await owner.post('/companies', companyInput('Entreprise A'))).json();
  b = (await owner.post('/companies', companyInput('Entreprise B', { defaultCurrency: 'EUR', taxPreset: 'fr' }))).json();
});
afterEach(() => ctx.close());

async function memberWith(role: 'admin' | 'editor' | 'viewer', companyId: string): Promise<Client> {
  const u = (await owner.post('/admin/users', { displayName: `M ${role}`, email: `${role}@test.local`, password: 'membre12345' })).json();
  expect((await owner.put(`/companies/${companyId}/members`, { userId: u.id, role })).statusCode).toBe(200);
  const c = new Client(ctx.app);
  expect((await c.post('/auth/login', { email: `${role}@test.local`, password: 'membre12345' })).statusCode).toBe(200);
  return c;
}

describe('isolation des entreprises — niveau HTTP', () => {
  it('un membre ne voit que ses entreprises', async () => {
    const m = await memberWith('admin', a.id);
    const list = (await m.get('/companies')).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([a.id]);
    expect((await m.get(`/companies/${b.id}`)).statusCode).toBe(404);
    expect((await m.get(`/companies/${b.id}/activities`)).statusCode).toBe(404);
    expect((await m.get(`/companies/${b.id}/taxes`)).statusCode).toBe(404);
    expect((await m.post(`/companies/${b.id}/activities`, { name: 'Intrusion' })).statusCode).toBe(404);
    expect((await m.patch(`/companies/${b.id}`, { legalName: 'Piratée' })).statusCode).toBe(404);
  });

  it('une ressource d’une autre entreprise est introuvable via l’URL de son entreprise', async () => {
    const actB = (await owner.post(`/companies/${b.id}/activities`, { name: 'Conseil B' })).json();
    const taxB = (await owner.get(`/companies/${b.id}/taxes`)).json()[0];
    expect((await owner.patch(`/companies/${a.id}/activities/${actB.id}`, { name: 'x' })).statusCode).toBe(404);
    expect((await owner.post(`/companies/${a.id}/activities/${actB.id}/archive`)).statusCode).toBe(404);
    expect((await owner.patch(`/companies/${a.id}/taxes/${taxB.id}`, { ratePpm: 1 })).statusCode).toBe(404);
    // et rien n'a été modifié
    const after = (await owner.get(`/companies/${b.id}/activities`)).json();
    expect(after[0].name).toBe('Conseil B');
  });

  it('les listes ne mélangent jamais les entreprises', async () => {
    await owner.post(`/companies/${a.id}/activities`, { name: 'Formation' });
    await owner.post(`/companies/${b.id}/activities`, { name: 'Conseil' });
    const la = (await owner.get(`/companies/${a.id}/activities`)).json();
    const lb = (await owner.get(`/companies/${b.id}/activities`)).json();
    expect(la.map((x: { name: string }) => x.name)).toEqual(['Formation']);
    expect(lb.map((x: { name: string }) => x.name)).toEqual(['Conseil']);
    const ta = (await owner.get(`/companies/${a.id}/taxes`)).json().map((t: { name: string }) => t.name);
    const tb = (await owner.get(`/companies/${b.id}/taxes`)).json().map((t: { name: string }) => t.name);
    expect(ta).toEqual(['TPS', 'TVQ']);
    expect(tb).toEqual(['TVA 10 %', 'TVA 20 %', 'TVA 5,5 %']);
  });

  it('rôles : lecteur en lecture seule, éditeur sans administration', async () => {
    const viewer = await memberWith('viewer', a.id);
    expect((await viewer.get(`/companies/${a.id}/activities`)).statusCode).toBe(200);
    expect((await viewer.post(`/companies/${a.id}/activities`, { name: 'Non' })).statusCode).toBe(403);
    const editor = await memberWith('editor', a.id);
    expect((await editor.patch(`/companies/${a.id}`, { legalName: 'Non' })).statusCode).toBe(403);
    expect((await editor.post('/companies', companyInput('Non'))).statusCode).toBe(403);
    expect((await editor.get('/admin/users')).statusCode).toBe(403);
  });

  it('le retrait d’accès est immédiat', async () => {
    const m = await memberWith('editor', a.id);
    const me = (await m.get('/auth/me')).json();
    expect((await owner.del(`/companies/${a.id}/members/${me.user.id}`)).statusCode).toBe(204);
    expect((await m.get(`/companies/${a.id}`)).statusCode).toBe(404);
  });
});

describe('isolation des entreprises — niveau base de données', () => {
  it('une clé étrangère composite empêche de référencer un client d’une autre entreprise', () => {
    const { sqlite } = ctx.app.conn;
    const now = nowIso();
    const clientB = newId();
    sqlite
      .prepare(`INSERT INTO clients (id, company_id, type, name, created_at, updated_at) VALUES (?, ?, 'business', 'Client B', ?, ?)`)
      .run(clientB, b.id, now, now);
    const insertQuote = (companyId: string) =>
      sqlite
        .prepare(
          `INSERT INTO quotes (id, company_id, client_id, number, currency, issue_date, valid_until, tax_rounding, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'CAD', '2026-11-09', '2026-12-09', 'per_document', ?, ?)`,
        )
        .run(newId(), companyId, clientB, newId(), now, now);
    expect(() => insertQuote(a.id)).toThrow(/FOREIGN KEY/);
    expect(() => insertQuote(b.id)).not.toThrow();
  });

  it('via l’API, une erreur de clé étrangère est traduite proprement', async () => {
    // une activité d'une autre entreprise ne peut pas être rattachée à un article du catalogue
    const actB = (await owner.post(`/companies/${b.id}/activities`, { name: 'Conseil B' })).json();
    const { sqlite } = ctx.app.conn;
    const now = nowIso();
    expect(() =>
      sqlite
        .prepare(`INSERT INTO catalog_items (id, company_id, activity_id, kind, name, currency, created_at, updated_at) VALUES (?, ?, ?, 'service', 'X', 'CAD', ?, ?)`)
        .run(newId(), a.id, actB.id, now, now),
    ).toThrow(/FOREIGN KEY/);
  });
});
