import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { userCreateSchema } from '@im/shared/schemas';
import type { UserSummary } from '@im/shared/types';
import { transaction } from '../../database/connection';
import { sessions, users } from '../../database/schema';
import { requireOwner } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { listAudit, recordAudit } from '../audit/service';
import { hashPassword } from '../auth/password';

const toDto = (u: typeof users.$inferSelect): UserSummary => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
});

export async function adminRoutes(app: FastifyInstance) {
  const { conn } = app;

  app.get('/admin/users', { preHandler: requireOwner }, async () =>
    conn.db.select().from(users).orderBy(asc(users.displayName)).all().map(toDto),
  );

  app.post('/admin/users', { preHandler: requireOwner }, async (req, reply) => {
    const input = parse(userCreateSchema, req.body);
    if (conn.db.select().from(users).where(eq(users.email, input.email)).get()) {
      throw conflict('EMAIL_TAKEN', 'Un utilisateur utilise déjà cette adresse');
    }
    const passwordHash = await hashPassword(input.password);
    const id = newId();
    transaction(conn, () => {
      const now = nowIso();
      conn.db.insert(users).values({ id, email: input.email, displayName: input.displayName, passwordHash, role: 'member', passwordChangedAt: now, createdAt: now, updatedAt: now }).run();
      recordAudit(conn.db, { userId: req.user!.id, action: 'create', entityType: 'user', entityId: id, summary: `Utilisateur créé : ${input.displayName}` });
    });
    return reply.code(201).send(toDto(conn.db.select().from(users).where(eq(users.id, id)).get()!));
  });

  app.patch('/admin/users/:id', { preHandler: requireOwner }, async (req) => {
    const id = (req.params as { id: string }).id;
    const input = parse(z.object({ isActive: z.boolean().optional(), displayName: z.string().trim().min(1).max(120).optional() }), req.body);
    const u = conn.db.select().from(users).where(eq(users.id, id)).get();
    if (!u) throw notFound('Utilisateur');
    if (u.role === 'owner' && input.isActive === false) throw badRequest('OWNER_REQUIRED', 'Le propriétaire ne peut pas être désactivé');
    transaction(conn, () => {
      conn.db.update(users).set({ ...input, updatedAt: nowIso() }).where(eq(users.id, id)).run();
      if (input.isActive === false) conn.db.delete(sessions).where(eq(sessions.userId, id)).run();
      recordAudit(conn.db, { userId: req.user!.id, action: 'update', entityType: 'user', entityId: id, summary: `Utilisateur modifié : ${u.displayName}`, changes: input });
    });
    return toDto(conn.db.select().from(users).where(eq(users.id, id)).get()!);
  });

  app.get('/admin/audit', { preHandler: requireOwner }, async (req) => {
    const q = parse(z.object({ companyId: z.string().optional(), limit: z.coerce.number().int().min(1).max(1000).optional() }), req.query);
    return listAudit(conn.db, q);
  });
}
