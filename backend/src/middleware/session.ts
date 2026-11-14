/** Session par cookie (serveur Node / banc de test uniquement ; l'application iPhone n'a pas de compte). */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '@im/shared/constants';
import { resolveSession } from '../modules/auth/service';

/** Charge l'utilisateur à partir du cookie de session (sans l'exiger). */
export async function loadSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  req.user = null;
  req.sessionToken = null;
  req.company = null;
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return;
  const s = resolveSession(req.server.conn, token);
  if (!s) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return;
  }
  req.user = s.user;
  req.sessionToken = token;
}

