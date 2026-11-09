import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { z } from 'zod';
import { runMigrations } from '../../database/migrate';
import { orgSettings } from '../../database/schema';
import { requireOwner } from '../../middleware/auth';
import { AppError, badRequest } from '../../utils/errors';
import { nowIso } from '../../utils/time';
import { parse } from '../../utils/validate';
import { recordAudit } from '../audit/service';
import { BackupError, createBackup, exportArchive, freeBytes, listBackups, restore, rotateBackups } from './service';

export function retentionPolicy(app: FastifyInstance) {
  const s = app.conn.db.select().from(orgSettings).get();
  return { daily: s?.backupRetentionDaily ?? 7, weekly: s?.backupRetentionWeekly ?? 4, monthly: s?.backupRetentionMonthly ?? 12 };
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BackupError) throw new AppError(e.code === 'DISK_FULL' ? 507 : 400, e.code, e.message);
    throw e;
  }
};

export async function backupRoutes(app: FastifyInstance) {
  const cfg = app.config;
  const exportDir = () => app.conn.db.select({ d: orgSettings.backupExportDir }).from(orgSettings).get()?.d || join(cfg.dataDir, 'exports');

  app.get('/admin/backups', { preHandler: requireOwner }, async () => {
    const s = app.conn.db.select().from(orgSettings).get();
    return {
      backups: listBackups(cfg.backupsDir),
      dataDir: cfg.dataDir,
      backupsDir: cfg.backupsDir,
      documentsDir: cfg.documentsDir,
      exportDir: exportDir(),
      freeBytes: freeBytes(cfg.backupsDir),
      retention: { daily: s?.backupRetentionDaily ?? 7, weekly: s?.backupRetentionWeekly ?? 4, monthly: s?.backupRetentionMonthly ?? 12 },
    };
  });

  app.post('/admin/backups', { preHandler: requireOwner }, async (req, reply) =>
    wrap(async () => {
      const b = await createBackup(app.conn.sqlite, cfg.backupsDir, { reason: 'manual', appVersion: cfg.version });
      rotateBackups(cfg.backupsDir, retentionPolicy(app));
      recordAudit(app.conn.db, { userId: req.user!.id, action: 'backup', entityType: 'backup', entityId: b.name, summary: `Sauvegarde manuelle ${b.name}` });
      return reply.code(201).send({ name: b.name, manifest: b.manifest });
    }),
  );

  app.post('/admin/backups/export', { preHandler: requireOwner }, async (req, reply) =>
    wrap(async () => {
      const r = await exportArchive(app.conn.sqlite, { backupsDir: cfg.backupsDir, documentsDir: cfg.documentsDir, exportDir: exportDir() }, cfg.version);
      recordAudit(app.conn.db, { userId: req.user!.id, action: 'export', entityType: 'backup', summary: `Export complet : ${r.file}` });
      return reply.code(201).send(r);
    }),
  );

  app.patch('/admin/backup-settings', { preHandler: requireOwner }, async (req) => {
    const input = parse(
      z.object({
        exportDir: z.string().trim().max(1000).nullish(),
        daily: z.number().int().min(1).max(60).optional(),
        weekly: z.number().int().min(0).max(52).optional(),
        monthly: z.number().int().min(0).max(120).optional(),
      }),
      req.body,
    );
    if (input.exportDir && !input.exportDir.startsWith('/')) throw badRequest('INVALID_PATH', 'Chemin absolu attendu (ex. /Volumes/Disque/Sauvegardes)');
    app.conn.db
      .update(orgSettings)
      .set({
        ...(input.exportDir !== undefined ? { backupExportDir: input.exportDir || null } : {}),
        ...(input.daily ? { backupRetentionDaily: input.daily } : {}),
        ...(input.weekly !== undefined ? { backupRetentionWeekly: input.weekly } : {}),
        ...(input.monthly !== undefined ? { backupRetentionMonthly: input.monthly } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(orgSettings.id, 1))
      .run();
    recordAudit(app.conn.db, { userId: req.user!.id, action: 'update', entityType: 'backup_settings', summary: 'Paramètres de sauvegarde modifiés', changes: input });
    return { ok: true };
  });

  /** Restauration : confirmation explicite (nom de la sauvegarde retapé), sauvegarde de sécurité préalable. */
  app.post('/admin/backups/:name/restore', { preHandler: requireOwner }, async (req) => {
    const { name } = req.params as { name: string };
    const { confirm } = parse(z.object({ confirm: z.string() }), req.body);
    if (confirm !== name) throw badRequest('CONFIRMATION_REQUIRED', 'Confirmez en indiquant le nom exact de la sauvegarde');
    const userId = req.user!.id;
    return wrap(async () => {
      const r = await restore(
        app.conn,
        { dbPath: cfg.dbPath, backupsDir: cfg.backupsDir, documentsDir: cfg.documentsDir, migrationsDir: cfg.migrationsDir },
        { backupName: name },
        { appVersion: cfg.version, migrate: async (c) => void (await runMigrations(c, { migrationsDir: cfg.migrationsDir, backupsDir: null, appVersion: cfg.version })) },
      );
      // L'utilisateur existe-t-il dans la base restaurée ? Sinon l'entrée d'audit est anonyme.
      const exists = app.conn.sqlite.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
      recordAudit(app.conn.db, { userId: exists ? userId : null, action: 'restore', entityType: 'backup', entityId: name, summary: `Restauration de ${name} (sauvegarde de sécurité : ${r.safetyBackup})` });
      return { restored: name, safetyBackup: r.safetyBackup, manifest: r.manifest };
    });
  });
}
