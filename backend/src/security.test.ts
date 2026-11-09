/** Contrôles de sécurité transverses (ARCHITECTURE.md §10). */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config/index';
import { Client, companyInput, makeApp, setupOwner, type TestCtx } from './test/helpers';

let ctx: TestCtx;
beforeEach(async () => (ctx = await makeApp()));
afterEach(() => ctx.close());

describe('sécurité', () => {
  it('en-têtes de sécurité (CSP stricte, nosniff, anti-framing)', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['content-security-policy']).toContain("object-src 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('toutes les routes métier exigent une session', async () => {
    const c = await setupOwner(ctx.app);
    const cid = (await c.post('/companies', companyInput('X'))).json().id;
    const anon = new Client(ctx.app);
    for (const url of ['/companies', `/companies/${cid}`, `/companies/${cid}/clients`, `/companies/${cid}/invoices`, `/companies/${cid}/quotes`, `/companies/${cid}/payments`, '/dashboard', '/search?q=ab', '/admin/backups', '/admin/audit', '/currencies']) {
      expect((await anon.get(url)).statusCode, url).toBe(401);
    }
  });

  it('les réponses API ne sont pas mises en cache et n’exposent pas de pile d’erreur', async () => {
    const c = await setupOwner(ctx.app);
    const r = await c.get('/companies/inexistante');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Entreprise introuvable' } });
  });

  it('écoute réseau local refusée par défaut', () => {
    expect(() => loadConfig({ profile: 'test', host: '0.0.0.0' })).toThrow(/réseau local/);
    expect(loadConfig({ profile: 'test' }).host).toBe('127.0.0.1');
  });

  it('fichiers de données réservés à l’utilisateur', async () => {
    await setupOwner(ctx.app);
    const mode = statSync(join(ctx.dataDir, 'data', 'invoice-manager.db')).mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it('les champs de recherche et de liste résistent à l’injection SQL', async () => {
    const c = await setupOwner(ctx.app);
    const cid = (await c.post('/companies', companyInput('X'))).json().id;
    await c.post(`/companies/${cid}/clients`, { name: "O'Brien" });
    const r = await c.get(`/companies/${cid}/clients?q=${encodeURIComponent("' OR 1=1 --")}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
    expect((await c.get(`/companies/${cid}/clients?q=${encodeURIComponent("o'b")}`)).json()).toHaveLength(1);
  });
});
