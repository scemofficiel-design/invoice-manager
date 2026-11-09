import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE } from '@im/shared/constants';
import { changePasswordSchema, loginSchema, setupSchema, userPreferencesSchema } from '@im/shared/schemas';
import type { AuthStatus, MeResponse } from '@im/shared/types';
import { orgSettings, users } from '../../database/schema';
import { requireAuth } from '../../middleware/auth';
import { nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { listCompaniesForUser } from '../companies/service';
import { changePassword, createSession, isSetupRequired, login, logout, setup } from './service';

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', secure: false, expires: expiresAt });
}

export async function authRoutes(app: FastifyInstance) {
  const { conn, config } = app;

  app.get('/auth/status', async (req): Promise<AuthStatus> => ({
    setupRequired: isSetupRequired(conn),
    authenticated: !!req.user,
    profile: config.profile,
  }));

  app.post('/auth/setup', { config: { rateLimit: { timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = parse(setupSchema, req.body);
    const { userId } = await setup(conn, input);
    const s = createSession(conn, userId, req.headers['user-agent'] ?? null);
    setSessionCookie(reply, s.token, s.expiresAt);
    return reply.code(201).send({ ok: true });
  });

  app.post('/auth/login', { config: { rateLimit: { timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const s = await login(conn, input.email, input.password, req.headers['user-agent'] ?? null);
    setSessionCookie(reply, s.token, s.expiresAt);
    return { ok: true };
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.user && req.sessionToken) logout(conn, req.sessionToken, req.user.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req): Promise<MeResponse> => {
    const org = conn.db.select({ name: orgSettings.name }).from(orgSettings).get();
    return {
      user: req.user!,
      organization: { name: org?.name ?? '' },
      profile: config.profile,
      companies: listCompaniesForUser(conn, req.user!),
    };
  });

  app.post('/auth/password', { preHandler: requireAuth, config: { rateLimit: { timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = parse(changePasswordSchema, req.body);
    await changePassword(conn, req.user!.id, input.currentPassword, input.newPassword);
    // Toutes les sessions ont été invalidées : on en rouvre une pour l'utilisateur courant.
    const s = createSession(conn, req.user!.id, req.headers['user-agent'] ?? null);
    setSessionCookie(reply, s.token, s.expiresAt);
    return reply.code(204).send();
  });

  app.patch('/auth/preferences', { preHandler: requireAuth }, async (req) => {
    const input = parse(userPreferencesSchema, req.body);
    conn.db.update(users).set({ ...input, updatedAt: nowIso() }).where(eq(users.id, req.user!.id)).run();
    return { ...req.user!, ...input };
  });
}
