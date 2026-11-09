import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, companyInput, makeApp, OWNER, setupOwner, type TestCtx } from '../../test/helpers';
import { addDays, todayLocal } from '../../utils/time';
import { DB_FILE, rotateBackups } from './service';

let ctx: TestCtx;
let c: Client;
let cid: string;
const today = todayLocal();
beforeEach(async () => {
  ctx = await makeApp();
  c = await setupOwner(ctx.app);
  cid = (await c.post('/companies', companyInput('Sauvegarde'))).json().id;
});
afterEach(() => ctx.close());

const backupsDir = () => join(ctx.dataDir, 'backups');
const addClient = (name: string) => c.post(`/companies/${cid}/clients`, { name });
const clientNames = async () => (await c.get(`/companies/${cid}/clients`)).json().map((x: { name: string }) => x.name);

describe('sauvegardes', () => {
  it('sauvegarde manuelle cohérente avec manifeste', async () => {
    await addClient('Avant');
    const r = await c.post('/admin/backups');
    expect(r.statusCode).toBe(201);
    const { name, manifest } = r.json();
    expect(manifest).toMatchObject({ reason: 'manual', counts: { companies: 1, clients: 1 } });
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(backupsDir(), name, DB_FILE))).toBe(true);
    const list = (await c.get('/admin/backups')).json();
    expect(list.backups[0].name).toBe(name);
    expect(list.freeBytes).toBeGreaterThan(0);
  });

  it('restauration : retour à l’état sauvegardé, avec sauvegarde de sécurité', async () => {
    await addClient('Avant');
    const { name } = (await c.post('/admin/backups')).json();
    await addClient('Après');
    expect(await clientNames()).toEqual(['Après', 'Avant']);
    expect((await c.post(`/admin/backups/${name}/restore`, { confirm: 'mauvais' })).json().error.code).toBe('CONFIRMATION_REQUIRED');
    const r = await c.post(`/admin/backups/${name}/restore`, { confirm: name });
    expect(r.statusCode).toBe(200);
    // les sessions sont celles de la base restaurée : on se reconnecte
    await c.post('/auth/login', { email: OWNER.email, password: OWNER.password });
    expect(await clientNames()).toEqual(['Avant']);
    const list = (await c.get('/admin/backups')).json().backups;
    expect(list.some((b: { name: string }) => b.name === r.json().safetyBackup)).toBe(true);
    const audit = (await c.get('/admin/audit')).json();
    expect(audit.some((e: { action: string }) => e.action === 'restore')).toBe(true);
  });

  it('refuse une sauvegarde altérée', async () => {
    const { name } = (await c.post('/admin/backups')).json();
    appendFileSync(join(backupsDir(), name, DB_FILE), 'x');
    const r = await c.post(`/admin/backups/${name}/restore`, { confirm: name });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('INVALID_BACKUP');
    expect(await clientNames()).toEqual([]); // base courante intacte
  });

  it('refuse un nom de sauvegarde hors du dossier', async () => {
    const r = await c.post('/admin/backups/..%2F..%2Fetc/restore', { confirm: '../../etc' });
    expect(r.statusCode).toBe(400);
  });

  it('export complet .tar.gz (base + documents) puis restauration depuis l’archive', async () => {
    const cl = (await addClient('Exporté')).json().id;
    const d = (await c.post(`/companies/${cid}/invoices`, { clientId: cl, currency: 'CAD', issueDate: today, dueDate: addDays(today, 1), lines: [{ name: 'X', quantityMilli: 1000, unitPriceMinor: 100 }] })).json();
    await c.post(`/companies/${cid}/invoices/${d.id}/issue`);
    const ex = await c.post('/admin/backups/export');
    expect(ex.statusCode).toBe(201);
    expect(ex.json().file).toMatch(/\.tar\.gz$/);
    await addClient('Après export');
    const { restore } = await import('./service');
    const { runMigrations } = await import('../../database/migrate');
    const cfg = ctx.app.config;
    await restore(ctx.app.conn, cfg, { archivePath: ex.json().file }, { appVersion: 't', migrate: async (x) => void (await runMigrations(x, { migrationsDir: cfg.migrationsDir, backupsDir: null, appVersion: 't' })) });
    await c.post('/auth/login', { email: OWNER.email, password: OWNER.password });
    expect(await clientNames()).toEqual(['Exporté']);
    // le PDF archivé est toujours servi et intègre
    const pdf = await ctx.app.inject({ method: 'GET', url: `/api/v1/companies/${cid}/invoices/${d.id}/pdf`, headers: { cookie: `im_session=${c.cookie}` } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['x-archived']).toBe('1');
  });

  it('réservé au propriétaire', async () => {
    const u = (await c.post('/admin/users', { displayName: 'M', email: 'm@test.local', password: 'membre12345' })).json();
    await c.put(`/companies/${cid}/members`, { userId: u.id, role: 'admin' });
    const m = new Client(ctx.app);
    await m.post('/auth/login', { email: 'm@test.local', password: 'membre12345' });
    expect((await m.post('/admin/backups')).statusCode).toBe(403);
    expect((await m.get('/admin/backups')).statusCode).toBe(403);
  });
});

describe('rotation', () => {
  it('garde la plus récente par jour / semaine / mois et les 10 dernières manuelles', () => {
    const dir = join(ctx.dataDir, 'rot');
    const mk = (iso: string, reason: string) => {
      const name = `${iso.replace(/[:.]/g, '-')}_${reason}`;
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, 'manifest.json'), JSON.stringify({ createdAt: iso, reason, sha256: '', size: 0, counts: {}, schemaMigrations: 0, appVersion: 't' }));
    };
    const base = Date.UTC(2026, 10, 9, 12);
    for (let d = 0; d < 120; d++) mk(new Date(base - d * 86_400_000).toISOString(), 'auto');
    mk(new Date(base - 3 * 86_400_000 + 3600_000).toISOString(), 'auto'); // 2e sauvegarde le même jour
    for (let i = 0; i < 12; i++) mk(new Date(base - i * 3600_000).toISOString(), 'manual');
    const removed = rotateBackups(dir, { daily: 7, weekly: 4, monthly: 12 });
    const left = readdirSync(dir);
    expect(left.filter((n) => n.endsWith('_manual'))).toHaveLength(10);
    const autos = left.filter((n) => n.endsWith('_auto'));
    expect(autos.length).toBeGreaterThanOrEqual(7);
    expect(autos.length).toBeLessThanOrEqual(7 + 4 + 12);
    expect(removed.length).toBe(121 + 12 - left.length);
  });
});
