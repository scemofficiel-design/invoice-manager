import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transaction } from '../../database/connection';
import { Client, companyInput, makeApp, setupOwner, type TestCtx } from '../../test/helpers';
import { allocateNumber } from '../numbering/service';

let ctx: TestCtx;
let owner: Client;
beforeEach(async () => {
  ctx = await makeApp();
  owner = await setupOwner(ctx.app);
});
afterEach(() => ctx.close());

// PNG 1×1 valide
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('entreprises', () => {
  it('création complète avec préréglage fiscal, numérotation et journal', async () => {
    const r = await owner.post('/companies', companyInput('Studio Nord', { country: 'CA', legalIds: [{ label: 'NEQ', value: '1234567890' }], paymentTermsDays: 15 }));
    expect(r.statusCode).toBe(201);
    const c = r.json();
    expect(c).toMatchObject({ legalName: 'Studio Nord', defaultCurrency: 'CAD', paymentTermsDays: 15, taxRounding: 'per_document', hasLogo: false, role: 'admin' });
    expect(c.legalIds).toEqual([{ label: 'NEQ', value: '1234567890' }]);
    const taxes = (await owner.get(`/companies/${c.id}/taxes`)).json();
    expect(taxes.map((t: { name: string; ratePpm: number }) => [t.name, t.ratePpm])).toEqual([['TPS', 50000], ['TVQ', 99750]]);
    const seq = (await owner.get(`/companies/${c.id}/numbering`)).json();
    const year = new Date().getFullYear();
    expect(seq.find((s: { docType: string }) => s.docType === 'invoice').preview).toBe(`FAC-${year}-00001`);
    const audit = (await owner.get(`/admin/audit?companyId=${c.id}`)).json();
    expect(audit.some((e: { action: string }) => e.action === 'create')).toBe(true);
  });

  it('validation backend des champs', async () => {
    expect((await owner.post('/companies', companyInput(''))).statusCode).toBe(400);
    expect((await owner.post('/companies', companyInput('X', { defaultCurrency: 'ZZZ' }))).json().error.code).toBe('UNKNOWN_CURRENCY');
    expect((await owner.post('/companies', companyInput('X', { email: 'pas-un-email' }))).statusCode).toBe(400);
    expect((await owner.post('/companies', companyInput('X', { taxPreset: 'inconnu' }))).json().error.code).toBe('UNKNOWN_TAX_PRESET');
  });

  it('modification journalisée et archivage', async () => {
    const c = (await owner.post('/companies', companyInput('Avant'))).json();
    const u = await owner.patch(`/companies/${c.id}`, { legalName: 'Après', taxRounding: 'per_line' });
    expect(u.json()).toMatchObject({ legalName: 'Après', taxRounding: 'per_line' });
    const audit = (await owner.get(`/admin/audit?companyId=${c.id}`)).json();
    const upd = audit.find((e: { action: string }) => e.action === 'update');
    expect(upd).toBeTruthy();
    expect((await owner.post(`/companies/${c.id}/archive`)).statusCode).toBe(204);
    expect((await owner.get(`/companies/${c.id}`)).json().archivedAt).not.toBeNull();
  });

  it('logo : PNG accepté, contenu falsifié refusé', async () => {
    const c = (await owner.post('/companies', companyInput('Logo'))).json();
    expect((await owner.put(`/companies/${c.id}/logo`, { dataUrl: PNG })).statusCode).toBe(204);
    const logo = await owner.get(`/companies/${c.id}/logo`);
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    const fake = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
    expect((await owner.put(`/companies/${c.id}/logo`, { dataUrl: fake })).json().error.code).toBe('INVALID_IMAGE');
    expect((await owner.del(`/companies/${c.id}/logo`)).statusCode).toBe(204);
    expect((await owner.get(`/companies/${c.id}/logo`)).statusCode).toBe(404);
  });
});

describe('numérotation', () => {
  it('attribution continue, sans doublon, avec remise à zéro annuelle', async () => {
    const c = (await owner.post('/companies', companyInput('Num'))).json();
    const { conn } = ctx.app;
    const take = (date: string) => transaction(conn, () => allocateNumber(conn.db, c.id, 'invoice', date));
    expect(take('2026-03-01')).toBe('FAC-2026-00001');
    expect(take('2026-03-02')).toBe('FAC-2026-00002');
    expect(take('2027-01-01')).toBe('FAC-2027-00001');
    expect(take('2027-01-02')).toBe('FAC-2027-00002');
  });

  it('une transaction annulée ne consomme pas de numéro', async () => {
    const c = (await owner.post('/companies', companyInput('Rollback'))).json();
    const { conn } = ctx.app;
    expect(() =>
      transaction(conn, () => {
        allocateNumber(conn.db, c.id, 'invoice', '2026-05-01');
        throw new Error('échec simulé');
      }),
    ).toThrow();
    expect(transaction(conn, () => allocateNumber(conn.db, c.id, 'invoice', '2026-05-01'))).toBe('FAC-2026-00001');
  });

  it('séquences indépendantes par entreprise', async () => {
    const a = (await owner.post('/companies', companyInput('A'))).json();
    const b = (await owner.post('/companies', companyInput('B'))).json();
    const { conn } = ctx.app;
    expect(transaction(conn, () => allocateNumber(conn.db, a.id, 'quote', '2026-01-01'))).toBe('DEV-2026-0001');
    expect(transaction(conn, () => allocateNumber(conn.db, b.id, 'quote', '2026-01-01'))).toBe('DEV-2026-0001');
  });

  it('motif modifiable, mais jamais de retour en arrière', async () => {
    const c = (await owner.post('/companies', companyInput('Motif'))).json();
    const ok = await owner.put(`/companies/${c.id}/numbering/invoice`, { pattern: 'F{YY}-{SEQ:3}', reset: 'never', nextValue: 100 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().find((s: { docType: string }) => s.docType === 'invoice').preview).toMatch(/^F\d{2}-100$/);
    const back = await owner.put(`/companies/${c.id}/numbering/invoice`, { pattern: 'F{YY}-{SEQ:3}', reset: 'never', nextValue: 50 });
    expect(back.json().error.code).toBe('NUMBERING_DECREASE');
    expect((await owner.put(`/companies/${c.id}/numbering/invoice`, { pattern: 'SANS-SEQ', reset: 'never' })).statusCode).toBe(400);
    expect((await owner.put(`/companies/${c.id}/numbering/invoice`, { pattern: '{FOO}-{SEQ}', reset: 'never' })).statusCode).toBe(400);
  });
});

describe('activités, taxes, devises', () => {
  it('activités : création, doublon refusé, archivage', async () => {
    const c = (await owner.post('/companies', companyInput('Act'))).json();
    const act = (await owner.post(`/companies/${c.id}/activities`, { name: 'Formation', color: '#336699' })).json();
    expect((await owner.post(`/companies/${c.id}/activities`, { name: 'Formation' })).statusCode).toBe(409);
    await owner.post(`/companies/${c.id}/activities/${act.id}/archive`);
    expect((await owner.get(`/companies/${c.id}/activities`)).json()).toHaveLength(0);
    expect((await owner.get(`/companies/${c.id}/activities?includeArchived=true`)).json()).toHaveLength(1);
  });

  it('taxes : aucun taux codé en dur, taux modifiable et validé', async () => {
    const c = (await owner.post('/companies', companyInput('Tax', { taxPreset: 'none' }))).json();
    expect((await owner.get(`/companies/${c.id}/taxes`)).json()).toHaveLength(0);
    const t = (await owner.post(`/companies/${c.id}/taxes`, { name: 'Taxe locale', ratePpm: 25_000, registrationNumber: 'REG-1' })).json();
    expect((await owner.patch(`/companies/${c.id}/taxes/${t.id}`, { ratePpm: 30_000 })).json().ratePpm).toBe(30_000);
    expect((await owner.patch(`/companies/${c.id}/taxes/${t.id}`, { ratePpm: 2_000_000 })).statusCode).toBe(400);
  });

  it('devises : ajout, doublon refusé, taux de change', async () => {
    expect((await owner.post('/currencies', { code: 'usd', name: 'Dollar américain', symbol: '$', minorUnits: 2 })).statusCode).toBe(201);
    expect((await owner.post('/currencies', { code: 'USD', name: 'x', symbol: '$', minorUnits: 2 })).statusCode).toBe(409);
    expect((await owner.get('/currencies')).json().map((c: { code: string }) => c.code)).toEqual(['CAD', 'EUR', 'USD', 'XOF']);
    expect((await owner.post('/exchange-rates', { baseCode: 'EUR', quoteCode: 'CAD', rate: '1.4925', effectiveDate: '2026-11-01' })).statusCode).toBe(201);
    expect((await owner.post('/exchange-rates', { baseCode: 'EUR', quoteCode: 'EUR', rate: '1', effectiveDate: '2026-11-01' })).statusCode).toBe(400);
    expect((await owner.post('/exchange-rates', { baseCode: 'EUR', quoteCode: 'CAD', rate: '1,49', effectiveDate: '2026-11-01' })).statusCode).toBe(400);
    const rates = (await owner.get('/exchange-rates')).json();
    expect(rates[0]).toMatchObject({ baseCode: 'EUR', quoteCode: 'CAD', rate: '1.4925' });
  });

  it('une devise principale ne peut pas être désactivée', async () => {
    await owner.post('/companies', companyInput('Dev'));
    expect((await owner.patch('/currencies/CAD', { isActive: false })).json().error.code).toBe('CURRENCY_IN_USE');
  });
});
