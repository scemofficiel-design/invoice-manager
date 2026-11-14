/**
 * Banc de test Node : expose le noyau métier via Fastify pour les tests d'intégration (Vitest).
 * L'application livrée est l'application iPhone, qui exécute les mêmes modules dans le navigateur.
 */
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { API_PREFIX } from '@im/shared/constants';
import type { AppConfig } from './config/index';
import { openDatabase, type Connection } from './database/connection';
import { runMigrations } from './database/migrate';
import { businessRoutes } from './business-routes';
import { csrfGuard } from './middleware/auth';
import { loadSession } from './middleware/session';
import { authRoutes } from './modules/auth/routes';
import { adminRoutes } from './modules/users/routes';
import { nodePdfRenderer } from './pdf/node-renderer';
import { setPdfRenderer } from './pdf/renderer';
import { AppError } from './utils/errors';
import { mapSqliteError } from './utils/sqlite-errors';

export interface CreateAppOptions {
  /** Connexion existante (tests) ; sinon la base du profil est ouverte. */
  connection?: Connection;
  /** Limite de tentatives de connexion par fenêtre (désactivée si 0). */
  loginRateLimit?: number;
}

export async function createApp(config: AppConfig, opts: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  const conn = opts.connection ?? openDatabase(config.dbPath);
  await runMigrations(conn, { migrationsDir: config.migrationsDir });
  setPdfRenderer(nodePdfRenderer);
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
      await api.register(adminRoutes);
      for (const r of businessRoutes) await api.register(r);
    },
    { prefix: API_PREFIX },
  );

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route introuvable' } }));

  return app;
}
