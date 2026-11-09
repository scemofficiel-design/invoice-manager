import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { CurrentUser } from '@im/shared/types';
import type { SetupInput } from '@im/shared/schemas';
import { transaction, type Connection } from '../../database/connection';
import { orgSettings, sessions, users } from '../../database/schema';
import { conflict, unauthorized } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { recordAudit } from '../audit/service';
import { dummyVerify, hashPassword, verifyPassword } from './password';

/** Durée de vie absolue d'une session, quelle que soit l'activité. */
const ABSOLUTE_SESSION_DAYS = 30;
/** Fréquence maximale de mise à jour de last_seen_at. */
const TOUCH_INTERVAL_MS = 60_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function isSetupRequired(conn: Connection): boolean {
  return !conn.db.select({ id: users.id }).from(users).limit(1).get();
}

function idleMinutes(conn: Connection): number {
  return conn.db.select({ m: orgSettings.sessionIdleMinutes }).from(orgSettings).get()?.m ?? 720;
}

export async function setup(conn: Connection, input: SetupInput): Promise<{ userId: string }> {
  const passwordHash = await hashPassword(input.password);
  return transaction(conn, () => {
    if (!isSetupRequired(conn)) throw conflict('ALREADY_SETUP', 'L’application est déjà configurée');
    const now = nowIso();
    const userId = newId();
    conn.db.insert(orgSettings).values({ id: 1, name: input.organizationName, updatedAt: now }).run();
    conn.db
      .insert(users)
      .values({
        id: userId,
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        role: 'owner',
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    recordAudit(conn.db, { userId, action: 'setup', entityType: 'organization', summary: `Configuration initiale : ${input.organizationName}` });
    return { userId };
  });
}

export async function login(
  conn: Connection,
  email: string,
  password: string,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const user = conn.db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await dummyVerify(password);
    throw unauthorized('Identifiants incorrects');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    recordAudit(conn.db, { userId: user.id, action: 'login_failed', entityType: 'user', entityId: user.id, summary: 'Échec de connexion' });
    throw unauthorized('Identifiants incorrects');
  }
  return createSession(conn, user.id, userAgent);
}

export function createSession(conn: Connection, userId: string, userAgent: string | null) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + idleMinutes(conn) * 60_000);
  transaction(conn, () => {
    // Nettoyage opportuniste des sessions expirées.
    conn.db.delete(sessions).where(lt(sessions.expiresAt, now.toISOString())).run();
    conn.db
      .insert(sessions)
      .values({
        idHash: hashToken(token),
        userId,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        userAgent: userAgent?.slice(0, 300) ?? null,
      })
      .run();
    conn.db.update(users).set({ lastLoginAt: now.toISOString() }).where(eq(users.id, userId)).run();
    recordAudit(conn.db, { userId, action: 'login', entityType: 'user', entityId: userId, summary: 'Connexion' });
  });
  return { token, expiresAt };
}

/** Résout une session valide et prolonge son expiration d'inactivité. Retourne null si invalide. */
export function resolveSession(conn: Connection, token: string): { user: CurrentUser; expiresAt: Date } | null {
  const idHash = hashToken(token);
  const row = conn.db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash))
    .get();
  if (!row) return null;
  const now = Date.now();
  const created = Date.parse(row.s.createdAt);
  if (
    Date.parse(row.s.expiresAt) <= now ||
    now - created > ABSOLUTE_SESSION_DAYS * 86_400_000 ||
    !row.u.isActive ||
    // une session ouverte avant un changement de mot de passe est invalide
    Date.parse(row.u.passwordChangedAt) > created
  ) {
    conn.db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return null;
  }
  let expiresAt = new Date(row.s.expiresAt);
  if (now - Date.parse(row.s.lastSeenAt) > TOUCH_INTERVAL_MS) {
    expiresAt = new Date(now + idleMinutes(conn) * 60_000);
    conn.db
      .update(sessions)
      .set({ lastSeenAt: new Date(now).toISOString(), expiresAt: expiresAt.toISOString() })
      .where(eq(sessions.idHash, idHash))
      .run();
  }
  const u = row.u;
  return {
    user: { id: u.id, email: u.email, displayName: u.displayName, role: u.role, locale: u.locale, theme: u.theme },
    expiresAt,
  };
}

export function logout(conn: Connection, token: string, userId: string): void {
  transaction(conn, () => {
    conn.db.delete(sessions).where(and(eq(sessions.idHash, hashToken(token)), eq(sessions.userId, userId))).run();
    recordAudit(conn.db, { userId, action: 'logout', entityType: 'user', entityId: userId, summary: 'Déconnexion' });
  });
}

export async function changePassword(conn: Connection, userId: string, current: string, next: string): Promise<void> {
  const user = conn.db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    throw unauthorized('Mot de passe actuel incorrect');
  }
  await setPassword(conn, userId, next, userId);
}

/** Définit un mot de passe et invalide toutes les sessions existantes de l'utilisateur. */
export async function setPassword(conn: Connection, userId: string, password: string, actorId: string | null): Promise<void> {
  const passwordHash = await hashPassword(password);
  const now = nowIso();
  transaction(conn, () => {
    conn.db.update(users).set({ passwordHash, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, userId)).run();
    conn.db.delete(sessions).where(eq(sessions.userId, userId)).run();
    recordAudit(conn.db, { userId: actorId, action: 'password_changed', entityType: 'user', entityId: userId, summary: 'Mot de passe modifié' });
  });
}
