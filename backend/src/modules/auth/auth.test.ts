import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, OWNER, makeApp, setupOwner, type TestCtx } from '../../test/helpers';

let ctx: TestCtx;
beforeEach(async () => (ctx = await makeApp()));
afterEach(() => ctx.close());

describe('authentification locale', () => {
  it('exige la configuration initiale puis la refuse une seconde fois', async () => {
    const c = new Client(ctx.app);
    expect((await c.get('/auth/status')).json()).toMatchObject({ setupRequired: true, authenticated: false });
    await setupOwner(ctx.app);
    expect((await c.get('/auth/status')).json()).toMatchObject({ setupRequired: false });
    expect((await c.post('/auth/setup', OWNER)).statusCode).toBe(409);
  });

  it('refuse un mot de passe faible', async () => {
    const r = await new Client(ctx.app).post('/auth/setup', { ...OWNER, password: 'court' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('connexion, session, déconnexion', async () => {
    await setupOwner(ctx.app);
    const c = new Client(ctx.app);
    expect((await c.get('/auth/me')).statusCode).toBe(401);
    expect((await c.post('/auth/login', { email: OWNER.email, password: 'mauvais-mdp-1' })).statusCode).toBe(401);
    expect((await c.post('/auth/login', { email: 'inconnu@test.local', password: 'x' })).statusCode).toBe(401);
    expect((await c.post('/auth/login', { email: OWNER.email.toUpperCase(), password: OWNER.password })).statusCode).toBe(200);
    const me = await c.get('/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: OWNER.email, role: 'owner' });
    expect(me.json().user.passwordHash).toBeUndefined();
    const token = c.cookie;
    expect((await c.post('/auth/logout')).statusCode).toBe(204);
    c.cookie = token; // réutiliser le jeton après déconnexion doit échouer
    expect((await c.get('/auth/me')).statusCode).toBe(401);
  });

  it('le cookie de session est HttpOnly et SameSite=Strict', async () => {
    const c = new Client(ctx.app);
    const r = await c.post('/auth/setup', OWNER);
    const cookie = r.cookies.find((k) => k.name === 'im_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
  });

  it('le changement de mot de passe invalide les autres sessions', async () => {
    const a = await setupOwner(ctx.app);
    const b = new Client(ctx.app);
    await b.post('/auth/login', { email: OWNER.email, password: OWNER.password });
    expect((await a.post('/auth/password', { currentPassword: OWNER.password, newPassword: 'nouveauMdp456' })).statusCode).toBe(204);
    expect((await a.get('/auth/me')).statusCode).toBe(200);
    expect((await b.get('/auth/me')).statusCode).toBe(401);
    expect((await b.post('/auth/login', { email: OWNER.email, password: 'nouveauMdp456' })).statusCode).toBe(200);
  });

  it('protection CSRF : en-tête obligatoire et origine vérifiée', async () => {
    const c = await setupOwner(ctx.app);
    const noHeader = await ctx.app.inject({ method: 'POST', url: '/api/v1/companies', payload: {}, headers: { cookie: `im_session=${c.cookie}` } });
    expect(noHeader.statusCode).toBe(403);
    const badOrigin = await c.req('POST', '/companies', { legalName: 'X', defaultCurrency: 'CAD' }, { origin: 'http://evil.example' });
    expect(badOrigin.statusCode).toBe(403);
  });
});

describe('limitation des tentatives', () => {
  it('bloque après trop d’échecs', async () => {
    const limited = await makeApp({ loginRateLimit: 3 });
    try {
      await setupOwner(limited.app);
      const c = new Client(limited.app);
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await c.post('/auth/login', { email: OWNER.email, password: 'faux-mdp-123' })).statusCode);
      expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
      expect(codes[4]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
