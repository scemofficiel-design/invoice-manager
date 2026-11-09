import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import type { DB } from '../../database/connection';
import { storedFiles } from '../../database/schema';
import { badRequest, notFound } from '../../utils/errors';
import { newId, nowIso } from '../../utils/time';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Détecte PNG / JPEG par signature binaire (le type déclaré n'est jamais cru sur parole). */
export function detectImage(buf: Buffer): { mime: 'image/png' | 'image/jpeg'; ext: 'png' | 'jpg' } | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

export function decodeDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest('INVALID_IMAGE', 'Image PNG ou JPEG attendue');
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > MAX_LOGO_BYTES) throw badRequest('IMAGE_TOO_LARGE', 'Image trop volumineuse (2 Mo maximum)');
  return buf;
}

/** Résout un chemin relatif stocké en base en garantissant qu'il reste dans le répertoire de données. */
export function safeResolve(dataDir: string, relPath: string): string {
  const abs = resolve(dataDir, relPath);
  if (!abs.startsWith(resolve(dataDir) + sep)) throw badRequest('INVALID_PATH', 'Chemin invalide');
  return abs;
}

export function storeFile(
  db: DB,
  dataDir: string,
  opts: { companyId: string | null; kind: 'logo' | 'pdf' | 'export'; entityType: string; entityId: string; absPath: string; mime: string; content: Buffer },
): string {
  const id = newId();
  mkdirSync(dirname(opts.absPath), { recursive: true, mode: 0o700 });
  writeFileSync(opts.absPath, opts.content, { mode: 0o600 });
  db.insert(storedFiles)
    .values({
      id,
      companyId: opts.companyId,
      kind: opts.kind,
      entityType: opts.entityType,
      entityId: opts.entityId,
      relPath: relative(dataDir, opts.absPath),
      mime: opts.mime,
      sha256: createHash('sha256').update(opts.content).digest('hex'),
      size: opts.content.length,
      createdAt: nowIso(),
    })
    .run();
  return id;
}

export function readStoredFile(db: DB, dataDir: string, fileId: string, companyId: string): { mime: string; content: Buffer } {
  const f = db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).get();
  if (!f || f.companyId !== companyId) throw notFound('Fichier');
  return { mime: f.mime, content: readFileSync(safeResolve(dataDir, f.relPath)) };
}

export const companyDir = (documentsDir: string, companyId: string) => join(documentsDir, 'companies', companyId);
