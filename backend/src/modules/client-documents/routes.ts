/**
 * Dossiers clients : anciennes factures importées (PDF, photos), rangées par client, avec des
 * informations facultatives (numéro, date, montant, devise, payée). Elles restent séparées des
 * factures émises par l'application : ni numérotation, ni tableaux de bord.
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { clientDocumentInfoSchema } from '@im/shared/schemas';
import type { ClientDocument } from '@im/shared/types';
import { transaction, type DB } from '../../database/tx';
import { clientDocuments, clients, currencies } from '../../database/schema';
import { companyAccess, scopeOf } from '../../middleware/auth';
import { badRequest, notFound } from '../../utils/errors';
import { fromBase64, sha256Hex } from '../../utils/bytes';
import { searchAny } from '../../utils/search';
import { newId, nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';
import { blobStore } from '../files/blob-store';
import { safeFileName } from '../files/service';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Type réel d'après la signature binaire : PDF, PNG, JPEG ou photo HEIC/HEIF de l'iPhone. */
export function detectDocumentType(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (b.length > 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'].includes(ascii(8, 12))) return 'image/heic';
  return null;
}

const toDto = (r: typeof clientDocuments.$inferSelect, clientName: string): ClientDocument => {
  const { sha256: _s, updatedAt: _u, ...rest } = r;
  return { ...rest, clientName };
};

function findDoc(db: DB, companyId: string, id: string) {
  const row = db
    .select({ d: clientDocuments, clientName: clients.name })
    .from(clientDocuments)
    .innerJoin(clients, and(eq(clients.id, clientDocuments.clientId), eq(clients.companyId, clientDocuments.companyId)))
    .where(and(eq(clientDocuments.companyId, companyId), eq(clientDocuments.id, id)))
    .get();
  if (!row) throw notFound('Document');
  return row;
}

function checkCurrency(db: DB, code: string | null) {
  if (code && !db.select().from(currencies).where(eq(currencies.code, code)).get()) throw badRequest('UNKNOWN_CURRENCY', `Devise inconnue : ${code}`);
}

export async function clientDocumentRoutes(app: FastifyInstance) {
  const { conn } = app;

  app.get('/companies/:companyId/documents', { preHandler: companyAccess('viewer') }, async (req) => {
    const q = parse(z.object({ clientId: z.string().max(64).optional(), q: z.string().trim().max(200).optional() }), req.query);
    const conds: SQL[] = [eq(clientDocuments.companyId, req.company!.id)];
    if (q.clientId) conds.push(eq(clientDocuments.clientId, q.clientId));
    if (q.q) conds.push(searchAny(q.q, [clientDocuments.fileName, clientDocuments.number, clientDocuments.notes, clients.name]));
    return conn.db
      .select({ d: clientDocuments, clientName: clients.name })
      .from(clientDocuments)
      .innerJoin(clients, and(eq(clients.id, clientDocuments.clientId), eq(clients.companyId, clientDocuments.companyId)))
      .where(and(...conds))
      .orderBy(asc(clients.name), desc(sql`coalesce(${clientDocuments.docDate}, substr(${clientDocuments.createdAt}, 1, 10))`), desc(clientDocuments.createdAt))
      .limit(5000)
      .all()
      .map((r) => toDto(r.d, r.clientName));
  });

  app.post('/companies/:companyId/clients/:clientId/documents', { preHandler: companyAccess('editor'), bodyLimit: 40 * 1024 * 1024 }, async (req, reply) => {
    const scope = scopeOf(req);
    const { clientId } = req.params as { clientId: string };
    const body = req.body as Record<string, unknown>;
    const { fileName } = parse(z.object({ fileName: z.string().trim().min(1).max(200) }), body);
    const info = parse(clientDocumentInfoSchema, body);
    const data = body.data instanceof Uint8Array ? body.data : typeof body.dataBase64 === 'string' ? fromBase64(body.dataBase64) : null;
    if (!data?.length) throw badRequest('EMPTY_FILE', 'Fichier vide');
    if (data.length > MAX_DOCUMENT_BYTES) throw badRequest('FILE_TOO_LARGE', 'Fichier trop volumineux (25 Mo maximum)');
    const mime = detectDocumentType(data);
    if (!mime) throw badRequest('UNSUPPORTED_FILE', 'Format non pris en charge : PDF, JPEG, PNG ou photo iPhone (HEIC)');
    const client = conn.db.select().from(clients).where(and(eq(clients.companyId, scope.companyId), eq(clients.id, clientId))).get();
    if (!client) throw notFound('Client');
    checkCurrency(conn.db, info.currency);

    const id = newId();
    await blobStore().put(id, data);
    try {
      transaction(conn, () => {
        const now = nowIso();
        conn.db
          .insert(clientDocuments)
          .values({ ...info, id, companyId: scope.companyId, clientId, kind: 'imported_invoice', fileName: safeFileName(fileName).slice(0, 200), mime, size: data.length, sha256: sha256Hex(data), createdAt: now, updatedAt: now })
          .run();
        recordAudit(conn.db, { ...scope, action: 'document_import', entityType: 'client_document', entityId: id, summary: `Document importé pour ${client.name} : ${fileName}` });
      });
    } catch (e) {
      await blobStore().delete(id);
      throw e;
    }
    return reply.code(201).send(toDto(findDoc(conn.db, scope.companyId, id).d, client.name));
  });

  app.patch('/companies/:companyId/documents/:id', { preHandler: companyAccess('editor') }, async (req) => {
    const scope = scopeOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const info = parse(clientDocumentInfoSchema, body);
    const move = parse(z.object({ clientId: z.string().max(64).optional() }), body);
    checkCurrency(conn.db, info.currency);
    transaction(conn, () => {
      const before = findDoc(conn.db, scope.companyId, id);
      if (move.clientId && !conn.db.select().from(clients).where(and(eq(clients.companyId, scope.companyId), eq(clients.id, move.clientId))).get()) throw notFound('Client');
      conn.db
        .update(clientDocuments)
        .set({ ...info, ...(move.clientId ? { clientId: move.clientId } : {}), updatedAt: nowIso() })
        .where(and(eq(clientDocuments.companyId, scope.companyId), eq(clientDocuments.id, id)))
        .run();
      recordAudit(conn.db, { ...scope, action: 'document_update', entityType: 'client_document', entityId: id, summary: `Document modifié : ${before.d.fileName}` });
    });
    const r = findDoc(conn.db, scope.companyId, id);
    return toDto(r.d, r.clientName);
  });

  app.delete('/companies/:companyId/documents/:id', { preHandler: companyAccess('editor') }, async (req, reply) => {
    const scope = scopeOf(req);
    const { id } = req.params as { id: string };
    transaction(conn, () => {
      const r = findDoc(conn.db, scope.companyId, id);
      conn.db.delete(clientDocuments).where(and(eq(clientDocuments.companyId, scope.companyId), eq(clientDocuments.id, id))).run();
      recordAudit(conn.db, { ...scope, action: 'document_delete', entityType: 'client_document', entityId: id, summary: `Document supprimé du dossier de ${r.clientName} : ${r.d.fileName}` });
    });
    await blobStore().delete(id);
    return reply.code(204).send();
  });

  app.get('/companies/:companyId/documents/:id/file', { preHandler: companyAccess('viewer') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = findDoc(conn.db, req.company!.id, id);
    const data = await blobStore().get(id);
    if (!data) throw notFound('Fichier');
    if (sha256Hex(data) !== r.d.sha256) throw badRequest('INTEGRITY_ERROR', 'Le fichier a été altéré (empreinte invalide)');
    return reply
      .header('content-type', r.d.mime)
      .header('content-disposition', `inline; filename="${r.d.fileName}"`)
      .send(data);
  });
}
