/**
 * Sauvegardes et restauration (ARCHITECTURE.md §9.2).
 *
 * - Copie cohérente via l'API de sauvegarde en ligne de SQLite (jamais une simple copie de fichier,
 *   sûre même pendant les écritures en WAL).
 * - Rotation : sauvegardes automatiques en GFS (quotidiennes / hebdomadaires / mensuelles),
 *   les autres (manuelles, pré-migration, pré-restauration) limitées aux plus récentes.
 * - Export : archive .tar.gz = base + documents + manifeste, vers un dossier choisi (disque externe…).
 * - Restauration : vérification (empreinte, intégrité SQLite, version de schéma), sauvegarde de
 *   sécurité de l'état courant, remplacement atomique puis réouverture de la connexion.
 */
import { createHash } from 'node:crypto';
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as tar from 'tar';
import type { Connection, Sqlite } from '../../database/connection';
import { applyPragmas } from '../../database/connection';
import * as schema from '../../database/schema';

export type BackupReason = 'manual' | 'auto' | 'pre-migration' | 'pre-restore';

export interface BackupManifest {
  createdAt: string;
  reason: BackupReason;
  appVersion: string;
  schemaMigrations: number;
  sha256: string;
  size: number;
  counts: Record<string, number>;
}

export interface BackupEntry {
  name: string;
  manifest: BackupManifest | null;
}

export const DB_FILE = 'invoice-manager.db';
const MIN_FREE_BYTES = 200 * 1024 * 1024;

export class BackupError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

function tableCount(sqlite: Sqlite, table: string): number {
  try {
    return (sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;
  } catch {
    return 0;
  }
}

export function freeBytes(dir: string): number {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const s = statfsSync(dir);
  return s.bavail * s.bsize;
}

function assertSpace(dir: string, needed = 0) {
  if (freeBytes(dir) < MIN_FREE_BYTES + needed) {
    throw new BackupError('DISK_FULL', 'Espace disque insuffisant pour effectuer une sauvegarde (minimum 200 Mo libres)');
  }
}

/** Snapshot cohérent + manifeste dans un dossier. */
async function snapshot(sqlite: Sqlite, dir: string, reason: BackupReason, appVersion: string): Promise<BackupManifest> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, DB_FILE);
  await sqlite.backup(file);
  const counts: Record<string, number> = {};
  for (const t of ['companies', 'clients', 'quotes', 'invoices', 'payments', 'receipts']) counts[t] = tableCount(sqlite, t);
  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    reason,
    appVersion,
    schemaMigrations: tableCount(sqlite, '__drizzle_migrations'),
    sha256: await sha256File(file),
    size: statSync(file).size,
    counts,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function createBackup(sqlite: Sqlite, backupsDir: string, opts: { reason: BackupReason; appVersion: string }): Promise<{ dir: string; name: string; manifest: BackupManifest }> {
  assertSpace(backupsDir);
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${opts.reason}`;
  const dir = join(backupsDir, name);
  const manifest = await snapshot(sqlite, dir, opts.reason, opts.appVersion);
  return { dir, name, manifest };
}

export function listBackups(backupsDir: string): BackupEntry[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(backupsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'exports').map((d) => d.name);
  } catch {
    return [];
  }
  return entries
    .sort()
    .reverse()
    .map((name) => {
      try {
        return { name, manifest: JSON.parse(readFileSync(join(backupsDir, name, 'manifest.json'), 'utf8')) as BackupManifest };
      } catch {
        return { name, manifest: null };
      }
    });
}

export function lastBackupAt(backupsDir: string): Date | null {
  const latest = listBackups(backupsDir).find((b) => b.manifest && b.manifest.reason === 'auto');
  return latest?.manifest ? new Date(latest.manifest.createdAt) : null;
}

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return `${y}-W${Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)}`;
};

/**
 * Rotation : pour les sauvegardes automatiques, on garde la plus récente de chacun des N derniers
 * jours, semaines et mois ; pour les autres motifs, les `keepOther` plus récentes. Retourne les supprimées.
 */
export function rotateBackups(backupsDir: string, policy: { daily: number; weekly: number; monthly: number; keepOther?: number }): string[] {
  const all = listBackups(backupsDir).filter((b) => b.manifest);
  const keep = new Set<string>();
  const auto = all.filter((b) => b.manifest!.reason === 'auto');
  const pick = (keyOf: (d: Date) => string, n: number) => {
    const seen = new Set<string>();
    for (const b of auto) {
      const k = keyOf(new Date(b.manifest!.createdAt));
      if (seen.has(k)) continue;
      if (seen.size >= n) break;
      seen.add(k);
      keep.add(b.name);
    }
  };
  pick((d) => d.toISOString().slice(0, 10), policy.daily);
  pick(isoWeek, policy.weekly);
  pick((d) => d.toISOString().slice(0, 7), policy.monthly);
  const byReason = new Map<string, BackupEntry[]>();
  for (const b of all.filter((x) => x.manifest!.reason !== 'auto')) byReason.set(b.manifest!.reason, [...(byReason.get(b.manifest!.reason) ?? []), b]);
  for (const list of byReason.values()) list.slice(0, policy.keepOther ?? 10).forEach((b) => keep.add(b.name));
  const removed: string[] = [];
  for (const b of all) {
    if (!keep.has(b.name)) {
      rmSync(join(backupsDir, b.name), { recursive: true, force: true });
      removed.push(b.name);
    }
  }
  return removed;
}

/** Export complet (base + documents) en .tar.gz. */
export async function exportArchive(sqlite: Sqlite, paths: { backupsDir: string; documentsDir: string; exportDir: string }, appVersion: string): Promise<{ file: string; size: number }> {
  assertSpace(paths.exportDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const staging = join(paths.backupsDir, `.export-${stamp}`);
  try {
    await snapshot(sqlite, staging, 'manual', appVersion);
    if (existsSync(paths.documentsDir)) cpSync(paths.documentsDir, join(staging, 'documents'), { recursive: true });
    mkdirSync(paths.exportDir, { recursive: true, mode: 0o700 });
    const file = join(paths.exportDir, `invoice-manager-export-${stamp}.tar.gz`);
    await tar.create({ gzip: true, file, cwd: staging, portable: true }, readdirSync(staging));
    return { file, size: statSync(file).size };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function journalCount(migrationsDir: string): number {
  return (JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] }).entries.length;
}

/** Vérifie une sauvegarde (dossier contenant manifest.json + base). */
export async function verifyBackupDir(dir: string, migrationsDir: string): Promise<BackupManifest> {
  const manifestPath = join(dir, 'manifest.json');
  const dbPath = join(dir, DB_FILE);
  if (!existsSync(manifestPath) || !existsSync(dbPath)) throw new BackupError('INVALID_BACKUP', 'Sauvegarde incomplète (manifeste ou base manquant)');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
  if ((await sha256File(dbPath)) !== manifest.sha256) throw new BackupError('INVALID_BACKUP', 'Empreinte de la base invalide : sauvegarde altérée');
  const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const res = probe.pragma('integrity_check', { simple: true });
    if (res !== 'ok') throw new BackupError('INVALID_BACKUP', `Base corrompue : ${String(res)}`);
    const applied = tableCount(probe, '__drizzle_migrations');
    if (applied > journalCount(migrationsDir)) throw new BackupError('NEWER_SCHEMA', 'Cette sauvegarde provient d’une version plus récente de l’application');
  } finally {
    probe.close();
  }
  return manifest;
}

export interface RestoreSource {
  /** Nom d'un dossier de sauvegarde dans backupsDir, ou chemin d'une archive .tar.gz exportée. */
  backupName?: string;
  archivePath?: string;
}

/**
 * Restauration. `reopen` rouvre la connexion et applique les migrations (fournie par l'appelant).
 * La connexion `conn` est modifiée sur place pour que tous les modules utilisent la base restaurée.
 */
export async function restore(
  conn: Connection,
  paths: { dbPath: string; backupsDir: string; documentsDir: string; migrationsDir: string },
  source: RestoreSource,
  opts: { appVersion: string; migrate: (c: Connection) => Promise<void> },
): Promise<{ manifest: BackupManifest; safetyBackup: string }> {
  let dir: string;
  let tmp: string | null = null;
  if (source.backupName) {
    if (!/^[\w.-]+$/.test(source.backupName)) throw new BackupError('INVALID_BACKUP', 'Nom de sauvegarde invalide');
    dir = resolve(paths.backupsDir, source.backupName);
    if (!dir.startsWith(resolve(paths.backupsDir) + sep)) throw new BackupError('INVALID_BACKUP', 'Chemin invalide');
  } else if (source.archivePath) {
    if (!existsSync(source.archivePath)) throw new BackupError('INVALID_BACKUP', 'Archive introuvable');
    tmp = join(paths.backupsDir, `.restore-${Date.now()}`);
    mkdirSync(tmp, { recursive: true, mode: 0o700 });
    // Extraction sécurisée : tar refuse par défaut les chemins absolus et les « .. ».
    await tar.extract({ file: source.archivePath, cwd: tmp, strict: true });
    dir = tmp;
  } else throw new BackupError('INVALID_BACKUP', 'Aucune source de restauration');

  try {
    const manifest = await verifyBackupDir(dir, paths.migrationsDir);
    assertSpace(paths.backupsDir, manifest.size);
    const safety = await createBackup(conn.sqlite, paths.backupsDir, { reason: 'pre-restore', appVersion: opts.appVersion });

    const staged = `${paths.dbPath}.restore`;
    cpSync(join(dir, DB_FILE), staged);
    conn.sqlite.close();
    for (const ext of ['-wal', '-shm']) rmSync(`${paths.dbPath}${ext}`, { force: true });
    renameSync(staged, paths.dbPath);
    const sqlite = new Database(paths.dbPath);
    applyPragmas(sqlite);
    conn.sqlite = sqlite;
    conn.db = drizzle(sqlite, { schema });
    await opts.migrate(conn);

    // Documents de l'archive : ajoutés sans écraser les fichiers existants (les PDF archivés sont immuables).
    if (existsSync(join(dir, 'documents'))) cpSync(join(dir, 'documents'), paths.documentsDir, { recursive: true, force: false, errorOnExist: false });
    return { manifest, safetyBackup: safety.name };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

export const backupLabel = (name: string) => basename(name);
