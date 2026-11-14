/**
 * Moteur local de l'application iPhone.
 *
 * Exécute dans le navigateur les MÊMES modules métier que ceux couverts par les tests d'intégration
 * (backend/src/business-routes.ts) : calculs, numérotation, factures figées, paiements, PDF…
 * Un petit routeur reproduit l'interface Fastify utilisée par ces modules. La base SQLite vit en
 * mémoire et est enregistrée dans le stockage de l'appareil après chaque modification.
 * Aucune donnée ne quitte l'appareil.
 */
import type { Database } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import { eq } from 'drizzle-orm';
import * as schema from '@backend/database/schema';
import { orgSettings, users } from '@backend/database/schema';
import type { Connection, DB } from '@backend/database/tx';
import { businessRoutes } from '@backend/business-routes';
import { listCompaniesForUser } from '@backend/modules/companies/service';
import { listAudit, recordAudit } from '@backend/modules/audit/service';
import { setPdfRenderer } from '@backend/pdf/renderer';
import { AppError } from '@backend/utils/errors';
import { mapSqliteError } from '@backend/utils/sqlite-errors';
import { newId, nowIso } from '@backend/utils/time';
import type { CurrentUser, MeResponse } from '@im/shared/types';
import { adapt, configure, loadSqlJs } from './sqlite';
import { appliedMigrations, migrate, MIGRATION_COUNT } from './migrate';
import { kvGet, kvSet, requestPersistence } from './store';

export const LOCAL_OWNER_ID = 'local-owner';
const DB_KEY = 'db';

// ── Routeur compatible avec l'interface Fastify utilisée par les modules métier ─────────────

type Handler = (req: LocalRequest, reply: LocalReply) => unknown;
interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  pre: Handler[];
  handler: Handler;
}
export interface LocalRequest {
  method: string;
  url: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  user: CurrentUser | null;
  company: { id: string; role: 'admin' | 'editor' | 'viewer' } | null;
  server: LocalApp;
  log: { error: (...a: unknown[]) => void; info: (...a: unknown[]) => void };
}
export class LocalReply {
  statusCode = 200;
  headers: Record<string, string> = {};
  payload: unknown = undefined;
  sent = false;
  code(n: number) {
    this.statusCode = n;
    return this;
  }
  header(k: string, v: string) {
    this.headers[k.toLowerCase()] = v;
    return this;
  }
  getHeader(k: string) {
    return this.headers[k.toLowerCase()];
  }
  send(p?: unknown) {
    this.payload = p;
    this.sent = true;
    return this;
  }
}

export interface LocalResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export class LocalApp {
  routes: Route[] = [];
  config = { version: '1.0.0', profile: 'local' };
  log = { error: console.error, info: () => {} };
  constructor(public conn: Connection) {}

  async register(fn: (app: never) => unknown) {
    await fn(this as never);
  }
  private add(method: string, path: string, a: unknown, b?: unknown) {
    const handler = (b ?? a) as Handler;
    const opts = (b ? a : {}) as { preHandler?: Handler | Handler[] };
    const keys: string[] = [];
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)'))}$`);
    this.routes.push({ method, re, keys, pre: opts.preHandler ? ([] as Handler[]).concat(opts.preHandler) : [], handler });
  }
  get(p: string, a: unknown, b?: unknown) { this.add('GET', p, a, b); }
  post(p: string, a: unknown, b?: unknown) { this.add('POST', p, a, b); }
  put(p: string, a: unknown, b?: unknown) { this.add('PUT', p, a, b); }
  patch(p: string, a: unknown, b?: unknown) { this.add('PATCH', p, a, b); }
  delete(p: string, a: unknown, b?: unknown) { this.add('DELETE', p, a, b); }

  async inject(method: string, url: string, body?: unknown): Promise<LocalResponse> {
    const [path = '', qs = ''] = url.split('?');
    const reply = new LocalReply();
    try {
      let match: RegExpExecArray | null = null;
      const route = this.routes.find((r) => r.method === method && (match = r.re.exec(path)));
      if (!route || !match) throw new AppError(404, 'NOT_FOUND', 'Route introuvable');
      const m = match as RegExpExecArray;
      const req: LocalRequest = {
        method,
        url,
        params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])),
        query: Object.fromEntries(new URLSearchParams(qs)),
        body: body ?? {},
        headers: {},
        user: currentUser(this.conn),
        company: null,
        server: this,
        log: this.log,
      };
      for (const p of route.pre) await p(req, reply);
      const result = await route.handler(req, reply);
      if (result !== reply && !reply.sent) reply.send(result);
      // L'opération n'est confirmée à l'écran qu'une fois enregistrée dans le stockage de l'appareil.
      if (method !== 'GET' && reply.statusCode < 400) await flush();
      return { status: reply.statusCode, headers: reply.headers, body: reply.payload };
    } catch (err) {
      const e = err instanceof AppError ? err : mapSqliteError(err);
      if (e) return { status: e.statusCode, headers: {}, body: { error: { code: e.code, message: e.message, details: e.details } } };
      console.error(err);
      return { status: 500, headers: {}, body: { error: { code: 'INTERNAL', message: (err as Error)?.message || 'Erreur interne' } } };
    }
  }
}

// ── Utilisateur unique de l'appareil ──────────────────────────────────────────────────────

function currentUser(conn: Connection): CurrentUser | null {
  const u = conn.db.select().from(users).where(eq(users.id, LOCAL_OWNER_ID)).get();
  return u ? { id: u.id, email: u.email, displayName: u.displayName, role: 'owner', locale: u.locale, theme: u.theme } : null;
}

/** Routes propres à l'application locale : pas de compte ni de mot de passe (l'iPhone est verrouillé). */
function localRoutes(app: LocalApp) {
  const { conn } = app;
  app.get('/auth/status', async () => ({ setupRequired: !currentUser(conn), authenticated: !!currentUser(conn), profile: 'local' }));
  app.post('/auth/setup', async (req: LocalRequest) => {
    const b = req.body as { organizationName?: string; displayName?: string };
    const org = (b.organizationName ?? '').trim().slice(0, 120);
    const name = (b.displayName ?? '').trim().slice(0, 120);
    if (!org || !name) throw new AppError(400, 'VALIDATION_ERROR', 'Nom de l’organisation et votre nom sont obligatoires');
    if (currentUser(conn)) throw new AppError(409, 'ALREADY_SETUP', 'L’application est déjà configurée');
    conn.sqlite.transaction(() => {
      const now = nowIso();
      conn.db.insert(orgSettings).values({ id: 1, name: org, updatedAt: now }).run();
      conn.db
        .insert(users)
        .values({ id: LOCAL_OWNER_ID, email: 'local@appareil', displayName: name, passwordHash: '!', role: 'owner', passwordChangedAt: now, createdAt: now, updatedAt: now })
        .run();
      recordAudit(conn.db, { userId: LOCAL_OWNER_ID, action: 'setup', entityType: 'organization', summary: `Configuration initiale : ${org}` });
    }).immediate();
    return { ok: true };
  });
  app.get('/auth/me', async (req: LocalRequest): Promise<MeResponse> => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Configuration requise');
    const org = conn.db.select({ name: orgSettings.name }).from(orgSettings).get();
    return { user: req.user, organization: { name: org?.name ?? '' }, profile: 'local', companies: listCompaniesForUser(conn, req.user) };
  });
  app.patch('/auth/preferences', async (req: LocalRequest) => {
    const b = req.body as { locale?: 'fr' | 'en'; theme?: 'light' | 'dark' | 'system'; displayName?: string };
    const set: Partial<typeof users.$inferInsert> = { updatedAt: nowIso() };
    if (b.locale === 'fr' || b.locale === 'en') set.locale = b.locale;
    if (b.theme && ['light', 'dark', 'system'].includes(b.theme)) set.theme = b.theme;
    if (typeof b.displayName === 'string' && b.displayName.trim()) set.displayName = b.displayName.trim().slice(0, 120);
    conn.db.update(users).set(set).where(eq(users.id, LOCAL_OWNER_ID)).run();
    return currentUser(conn);
  });
  app.get('/admin/audit', async (req: LocalRequest) => listAudit(conn.db, { companyId: req.query.companyId, limit: 500 }));
}

// ── Démarrage, persistance ─────────────────────────────────────────────────────────────────

let rawDb: Database | null = null;
let app: LocalApp | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persisting: Promise<void> = Promise.resolve();

function connect(db: Database): Connection {
  configure(db);
  return { sqlite: adapt(db), db: drizzle(db, { schema }) as unknown as DB };
}

/** Enregistre la base dans le stockage de l'appareil (différé, regroupe les écritures rapprochées). */
export function schedulePersist(delay = 300) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void flush(), delay);
}

export function flush(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persisting = persisting.then(async () => {
    if (!rawDb) return;
    const bytes = exportBytes();
    await kvSet(DB_KEY, bytes);
  });
  return persisting;
}

/** Copie binaire de la base. L'export sql.js rouvre la connexion : on réapplique les réglages. */
export function exportBytes(): Uint8Array {
  const bytes = rawDb!.export();
  configure(rawDb!);
  return bytes;
}

export async function boot(): Promise<LocalApp> {
  if (app) return app;
  const SQL = await loadSqlJs();
  const stored = await kvGet<Uint8Array>(DB_KEY);
  rawDb = stored ? new SQL.Database(stored) : new SQL.Database();
  const conn = connect(rawDb);
  const applied = migrate(rawDb);
  setPdfRenderer(async (def) => {
    const { renderInBrowser } = await import('./pdf');
    return renderInBrowser(def);
  });
  app = new LocalApp(conn);
  localRoutes(app);
  for (const r of businessRoutes) await app.register(r as never);
  if (!stored || applied) await flush();
  void requestPersistence();
  // Enregistrement immédiat quand l'app passe en arrière-plan (iOS peut alors la fermer).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
  return app;
}

export function localApp(): LocalApp {
  if (!app) throw new Error('Moteur local non démarré');
  return app;
}

// ── Sauvegarde / restauration par fichier ──────────────────────────────────────────────────

export interface BackupCheck {
  companies: number;
  invoices: number;
  clients: number;
}

/** Vérifie un fichier de sauvegarde sans toucher aux données actuelles. */
export async function inspectBackup(bytes: Uint8Array): Promise<BackupCheck> {
  const SQL = await loadSqlJs();
  let db: Database;
  try {
    db = new SQL.Database(bytes);
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde Invoice Manager valide.');
  }
  try {
    const ok = db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0];
    if (ok !== 'ok') throw new Error('Sauvegarde endommagée (contrôle d’intégrité en échec).');
    if (!db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='companies'`).length) {
      throw new Error('Ce fichier n’est pas une sauvegarde Invoice Manager valide.');
    }
    if (appliedMigrations(db) > MIGRATION_COUNT) throw new Error('Cette sauvegarde provient d’une version plus récente de l’application.');
    const n = (t: string) => Number(db.exec(`SELECT count(*) FROM ${t}`)[0]!.values[0]![0]);
    return { companies: n('companies'), invoices: n('invoices'), clients: n('clients') };
  } finally {
    db.close();
  }
}

/** Remplace toutes les données par la sauvegarde (l'état actuel est conservé en copie de sécurité). */
export async function restoreBackup(bytes: Uint8Array): Promise<void> {
  await inspectBackup(bytes);
  await flush();
  await kvSet('db-before-restore', exportBytes());
  const SQL = await loadSqlJs();
  const db = new SQL.Database(bytes);
  configure(db);
  migrate(db);
  await kvSet(DB_KEY, db.export());
  db.close();
}

export function auditBackup(action: 'backup_export' | 'restore', summary: string) {
  const a = localApp();
  if (!currentUser(a.conn)) return;
  recordAudit(a.conn.db, { userId: LOCAL_OWNER_ID, action, entityType: 'backup', entityId: newId(), summary });
  schedulePersist(0);
}
