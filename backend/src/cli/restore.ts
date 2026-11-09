/**
 * Restauration hors ligne : `npm run restore -- <nom-de-sauvegarde | archive.tar.gz>`
 * Sans argument : liste les sauvegardes disponibles. L'application doit être arrêtée.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/index';
import { openDatabase } from '../database/connection';
import { runMigrations } from '../database/migrate';
import { listBackups, restore } from '../modules/backup/service';

const config = loadConfig();
const arg = process.argv[2];
if (!arg) {
  console.log(`Sauvegardes disponibles (${config.backupsDir}) :`);
  for (const b of listBackups(config.backupsDir)) console.log(`  ${b.name}${b.manifest ? `  — ${b.manifest.counts.invoices ?? 0} factures` : '  (manifeste illisible)'}`);
  console.log('\nUsage : npm run restore -- <nom> | <chemin/vers/export.tar.gz>');
  process.exit(0);
}
try {
  const pid = Number(readFileSync(join(config.dataDir, 'app.lock'), 'utf8'));
  process.kill(pid, 0);
  console.error(`L’application est en cours d’exécution (PID ${pid}). Arrêtez-la ou utilisez Administration → Sauvegardes.`);
  process.exit(1);
} catch {
  /* aucune instance active */
}
const conn = openDatabase(config.dbPath);
const isArchive = arg.endsWith('.tar.gz') || arg.endsWith('.tgz');
try {
  const r = await restore(
    conn,
    { dbPath: config.dbPath, backupsDir: config.backupsDir, documentsDir: config.documentsDir, migrationsDir: config.migrationsDir },
    isArchive ? { archivePath: resolve(arg) } : { backupName: arg },
    { appVersion: config.version, migrate: async (c) => void (await runMigrations(c, { migrationsDir: config.migrationsDir, backupsDir: null, appVersion: config.version })) },
  );
  console.log(`Restauration terminée depuis ${arg} (${r.manifest.counts.invoices ?? 0} factures).`);
  console.log(`État précédent conservé dans la sauvegarde : ${r.safetyBackup}`);
} catch (e) {
  console.error(`Échec : ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  if (existsSync(config.dbPath)) conn.sqlite.close();
}
