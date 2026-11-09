/**
 * Fabrique de l'application. Réutilisable telle quelle par le serveur CLI, les tests,
 * et plus tard un empaquetage desktop (Electron/Tauri) ou un déploiement serveur.
 */
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { API_PREFIX } from '@im/shared/constants';
import type { AppConfig } from './config/index';
import { openDatabase, type Connection } from './database/connection';
import { runMigrations } from './database/migrate';
import { csrfGuard, loadSession } from './middleware/auth';
import { activityRoutes } from './modules/activities/routes';
import { authRoutes } from './modules/auth/routes';
import { companyRoutes } from './modules/companies/routes';
import { currencyRoutes } from './modules/currencies/routes';
import { taxRoutes } from './modules/taxes/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { clientRoutes } from './modules/clients/routes';
import { invoiceRoutes } from './modules/invoices/routes';
import { paymentRoutes } from './modules/payments/routes';
import { quoteRoutes } from './modules/quotes/routes';
import { pdfRoutes } from './pdf/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { searchRoutes } from './modules/search/routes';
import { backupRoutes } from './modules/backup/routes';
import { adminRoutes } from './modules/users/routes';
import { AppError } from './utils/errors';

export interface CreateAppOptions {
  /** Connexion existante (tests) ; sinon la base du profil est ouverte. */
  connection?: Connection;
  /** Limite de tentatives de connexion par fenêtre (désactivée si 0). */
  loginRateLimit?: number;
}

/** Traduit une erreur SQLite (contrainte, trigger) en erreur HTTP compréhensible. */
function mapSqliteError(err: Error & { code?: string }): AppError | null {
  if (!err.code?.startsWith('SQLITE_')) return null;
  const m = /^([A-Z_]+): (.+)$/.exec(err.message);
  if (err.code === 'SQLITE_CONSTRAINT_TRIGGER' && m) return new AppError(409, m[1]!, m[2]!);
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return new AppError(409, 'CONFLICT', 'Cette valeur existe déjà (doublon)');
  }
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError(400, 'INVALID_REFERENCE', 'Référence invalide ou appartenant à une autre entreprise');
  }
  if (err.code === 'SQLITE_CONSTRAINT_CHECK') return new AppError(400, 'CONSTRAINT_VIOLATION', 'Valeur non autorisée');
  return null;
}

export async function createApp(config: AppConfig, opts: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  const conn = opts.connection ?? openDatabase(config.dbPath);
  await runMigrations(conn, {
    migrationsDir: config.migrationsDir,
    backupsDir: config.profile === 'test' ? null : config.backupsDir,
    appVersion: config.version,
  });
  app.decorate('conn', conn);
  app.decorate('config', config);
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);
  app.decorateRequest('company', null);
  app.addHook('onClose', async () => {
    if (!opts.connection) conn.sqlite.close();
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: false,
  });
  const loginLimit = opts.loginRateLimit ?? 10;
  await app.register(rateLimit, { global: false, max: loginLimit || 1_000_000, timeWindow: '15 minutes' });

  app.setErrorHandler((error: FastifyError, req, reply) => {
    const mapped = error instanceof AppError ? error : mapSqliteError(error);
    if (mapped) {
      return reply.code(mapped.statusCode).send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
    }
    if (error.statusCode && error.statusCode < 500) {
      const code = error.statusCode === 429 ? 'RATE_LIMITED' : (error.code ?? 'BAD_REQUEST');
      const message = error.statusCode === 429 ? 'Trop de tentatives, réessayez plus tard' : error.message;
      return reply.code(error.statusCode).send({ error: { code, message } });
    }
    req.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Erreur interne du serveur' } });
  });

  app.get('/api/health', async () => ({ status: 'ok', version: config.version, profile: config.profile }));

  await app.register(
    async (api) => {
      api.addHook('onRequest', csrfGuard);
      api.addHook('onRequest', loadSession);
      api.addHook('onSend', async (_req, reply) => {
        reply.header('cache-control', reply.getHeader('cache-control') ?? 'no-store');
      });
      await api.register(authRoutes);
      await api.register(companyRoutes);
      await api.register(activityRoutes);
      await api.register(taxRoutes);
      await api.register(currencyRoutes);
      await api.register(adminRoutes);
      await api.register(clientRoutes);
      await api.register(catalogRoutes);
      await api.register(quoteRoutes);
      await api.register(invoiceRoutes);
      await api.register(paymentRoutes);
      await api.register(pdfRoutes);
      await api.register(dashboardRoutes);
      await api.register(searchRoutes);
      await api.register(backupRoutes);
    },
    { prefix: API_PREFIX },
  );

  // Frontend compilé (production) avec repli SPA.
  const staticDir = config.staticDir;
  const hasStatic = !!staticDir && existsSync(join(staticDir, 'index.html'));
  if (hasStatic) await app.register(fastifyStatic, { root: staticDir!, wildcard: false, index: ['index.html'] });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    // Repli SPA uniquement pour les routes de l'application, jamais pour un fichier manquant (.js, .css…).
    if (req.url.startsWith('/api') || !hasStatic || req.method !== 'GET' || /\.[a-z0-9]+$/i.test(path)) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });

  return app;
}
