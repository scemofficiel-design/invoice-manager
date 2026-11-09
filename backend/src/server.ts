/** Point d'entrée du serveur : verrou d'instance, démarrage, sauvegardes automatiques, arrêt propre. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config/index';
import { createBackup, lastBackupAt, rotateBackups } from './modules/backup/service';
import { retentionPolicy } from './modules/backup/routes';

const DAY_MS = 86_400_000;

function acquireLock(dataDir: string): () => void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const lockFile = join(dataDir, 'app.lock');
  try {
    const pid = Number(readFileSync(lockFile, 'utf8'));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        throw new Error(`Invoice Manager est déjà en cours d’exécution (PID ${pid}).`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  writeFileSync(lockFile, String(process.pid));
  return () => rmSync(lockFile, { force: true });
}

async function main() {
  const config = loadConfig();
  const release = acquireLock(config.dataDir);
  const app = await createApp(config);

  const backupIfDue = async () => {
    const last = lastBackupAt(config.backupsDir);
    if (last && Date.now() - last.getTime() < DAY_MS) return;
    try {
      const { dir } = await createBackup(app.conn.sqlite, config.backupsDir, { reason: 'auto', appVersion: config.version });
      app.log.info({ dir }, 'Sauvegarde automatique effectuée');
      const removed = rotateBackups(config.backupsDir, retentionPolicy(app));
      if (removed.length) app.log.info({ removed }, 'Rotation des sauvegardes');
    } catch (err) {
      app.log.error(err, 'Échec de la sauvegarde automatique');
    }
  };
  let timer: NodeJS.Timeout | null = null;
  if (config.autoBackup) {
    await backupIfDue();
    timer = setInterval(backupIfDue, 60 * 60 * 1000);
    timer.unref();
  }

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`Arrêt demandé (${signal})`);
    if (timer) clearInterval(timer);
    try {
      await app.close();
    } finally {
      release();
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    release();
    throw err;
  }
  app.log.info(`Invoice Manager [${config.profile}] → http://${config.host}:${config.port} — données : ${config.dataDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
