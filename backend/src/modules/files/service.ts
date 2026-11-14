/**
 * Fichiers (logos, PDF archivés) stockés DANS la base SQLite (colonne BLOB), avec empreinte SHA-256
 * vérifiée à chaque lecture. Une seule sauvegarde de la base contient donc tout.
 */
import { and, eq } from 'drizzle-orm';
import type { DB } from '../../database/tx';
import { storedFiles } from '../../database/schema';
import { AppError, badRequest, notFound } from '../../utils/errors';
import { fromBase64, sha256Hex } from '../../utils/bytes';
import { newId, nowIso } from '../../utils/time';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Détecte PNG / JPEG par signature binaire (le type déclaré n'est jamais cru sur parole). */
export function detectImage(buf: Uint8Array): { mime: 'image/png' | 'image/jpeg'; ext: 'png' | 'jpg' } | null {
  if (buf.length > 8 && PNG_SIG.every((b, i) => buf[i] === b)) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

export function decodeDataUrl(dataUrl: string): Uint8Array {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest('INVALID_IMAGE', 'Image PNG ou JPEG attendue');
  const buf = fromBase64(m[2]!);
  if (buf.length > MAX_LOGO_BYTES) throw badRequest('IMAGE_TOO_LARGE', 'Image trop volumineuse (2 Mo maximum)');
  return buf;
}

export function storeFile(
  db: DB,
  opts: { companyId: string | null; kind: 'logo' | 'pdf' | 'export'; entityType: string; entityId: string; relPath: string; mime: string; content: Uint8Array },
): string {
  const id = newId();
  db.insert(storedFiles)
    .values({
      id,
      companyId: opts.companyId,
      kind: opts.kind,
      entityType: opts.entityType,
      entityId: opts.entityId,
      relPath: opts.relPath,
      mime: opts.mime,
      sha256: sha256Hex(opts.content),
      size: opts.content.length,
      content: opts.content,
      createdAt: nowIso(),
    })
    .run();
  return id;
}

/** Lit un fichier de l'entreprise et vérifie son intégrité. */
export function readStoredFile(db: DB, fileId: string, companyId: string): { mime: string; content: Uint8Array } {
  const f = db.select().from(storedFiles).where(and(eq(storedFiles.id, fileId), eq(storedFiles.companyId, companyId))).get();
  if (!f || !f.content) throw notFound('Fichier');
  if (sha256Hex(f.content) !== f.sha256) throw new AppError(500, 'INTEGRITY_ERROR', 'Le fichier archivé a été modifié (empreinte invalide)');
  return { mime: f.mime, content: f.content };
}

export const safeFileName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
