import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DOC_TYPES } from '@im/shared/constants';
import { companyAccessSchema, companyCreateSchema, companyUpdateSchema, numberingUpdateSchema } from '@im/shared/schemas';
import { companyAccess, requireAuth, requireOwner, scopeOf } from '../../middleware/auth';
import { transaction } from '../../database/connection';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';
import { readStoredFile } from '../files/service';
import { listSequences, updateSequence } from '../numbering/service';
import {
  createCompany,
  getCompanyRow,
  listCompaniesForUser,
  listMembers,
  removeMember,
  setCompanyArchived,
  setCompanyLogo,
  setMember,
  toCompany,
  updateCompany,
} from './service';

export async function companyRoutes(app: FastifyInstance) {
  const { conn, config } = app;

  app.get('/companies', { preHandler: requireAuth }, async (req) => listCompaniesForUser(conn, req.user!));

  app.post('/companies', { preHandler: requireOwner }, async (req, reply) => {
    const company = createCompany(conn, req.user!.id, parse(companyCreateSchema, req.body));
    return reply.code(201).send(company);
  });

  app.get('/companies/:companyId', { preHandler: companyAccess('viewer') }, async (req) =>
    toCompany(getCompanyRow(conn, req.company!.id), req.company!.role),
  );

  app.patch('/companies/:companyId', { preHandler: companyAccess('admin') }, async (req) =>
    updateCompany(conn, scopeOf(req), req.company!.role, parse(companyUpdateSchema, req.body)),
  );

  app.post('/companies/:companyId/archive', { preHandler: [requireOwner, companyAccess('admin')] }, async (req, reply) => {
    setCompanyArchived(conn, scopeOf(req), true);
    return reply.code(204).send();
  });
  app.post('/companies/:companyId/unarchive', { preHandler: [requireOwner, companyAccess('admin')] }, async (req, reply) => {
    setCompanyArchived(conn, scopeOf(req), false);
    return reply.code(204).send();
  });

  // ── Logo ──
  app.get('/companies/:companyId/logo', { preHandler: companyAccess('viewer') }, async (req, reply) => {
    const row = getCompanyRow(conn, req.company!.id);
    if (!row.logoFileId) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Aucun logo' } });
    const f = readStoredFile(conn.db, config.dataDir, row.logoFileId, row.id);
    return reply.header('content-type', f.mime).header('cache-control', 'private, max-age=60').send(f.content);
  });
  app.put('/companies/:companyId/logo', { preHandler: companyAccess('admin'), bodyLimit: 3 * 1024 * 1024 }, async (req, reply) => {
    const { dataUrl } = parse(z.object({ dataUrl: z.string().max(3 * 1024 * 1024) }), req.body);
    setCompanyLogo(conn, config, scopeOf(req), dataUrl);
    return reply.code(204).send();
  });
  app.delete('/companies/:companyId/logo', { preHandler: companyAccess('admin') }, async (req, reply) => {
    setCompanyLogo(conn, config, scopeOf(req), null);
    return reply.code(204).send();
  });

  // ── Numérotation ──
  app.get('/companies/:companyId/numbering', { preHandler: companyAccess('viewer') }, async (req) => listSequences(conn.db, req.company!.id));
  app.put('/companies/:companyId/numbering/:docType', { preHandler: companyAccess('admin') }, async (req) => {
    const { docType } = parse(z.object({ docType: z.enum(DOC_TYPES) }), req.params);
    const input = parse(numberingUpdateSchema, req.body);
    const scope = scopeOf(req);
    transaction(conn, () => {
      const { before, after } = updateSequence(conn.db, scope.companyId, docType, input);
      recordAudit(conn.db, { ...scope, action: 'numbering_update', entityType: 'numbering', entityId: docType, summary: `Numérotation ${docType} modifiée`, changes: { before, after } });
    });
    return listSequences(conn.db, scope.companyId);
  });

  // ── Membres ──
  app.get('/companies/:companyId/members', { preHandler: companyAccess('admin') }, async (req) => listMembers(conn, req.company!.id));
  app.put('/companies/:companyId/members', { preHandler: companyAccess('admin') }, async (req) => {
    const input = parse(companyAccessSchema, req.body);
    setMember(conn, scopeOf(req), input.userId, input.role);
    return listMembers(conn, req.company!.id);
  });
  app.delete('/companies/:companyId/members/:userId', { preHandler: companyAccess('admin') }, async (req, reply) => {
    const { userId } = parse(z.object({ userId: z.string().min(1) }), req.params);
    removeMember(conn, scopeOf(req), userId);
    return reply.code(204).send();
  });
}

