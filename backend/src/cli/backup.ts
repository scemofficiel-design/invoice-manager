/**
 * Sauvegarde manuelle : `npm run backup` (base seule) ou `npm run backup -- --export [dossier]`
 * (archive complète .tar.gz : base + documents). Sûr même si l'application est en cours d'exécution.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/index';
import { openDatabase } from '../database/connection';
import { createBackup, exportArchive, rotateBackups } from '../modules/backup/service';

const config = loadConfig();
if (!existsSync(config.dbPath)) {
  console.error(`Aucune base trouvée pour le profil « ${config.profile} » (${config.dbPath}).`);
  process.exit(1);
}
const conn = openDatabase(config.dbPath);
try {
  const i = process.argv.indexOf('--export');
  if (i >= 0) {
    const s = conn.sqlite.prepare('SELECT backup_export_dir d FROM org_settings WHERE id = 1').get() as { d: string | null } | undefined;
    const dir = resolve(process.argv[i + 1] ?? s?.d ?? join(config.dataDir, 'exports'));
    const r = await exportArchive(conn.sqlite, { backupsDir: config.backupsDir, documentsDir: config.documentsDir, exportDir: dir }, config.version);
    console.log(`Export créé : ${r.file} (${(r.size / 1024).toFixed(0)} Ko)`);
  } else {
    const { dir, manifest } = await createBackup(conn.sqlite, config.backupsDir, { reason: 'manual', appVersion: config.version });
    rotateBackups(config.backupsDir, { daily: 7, weekly: 4, monthly: 12 });
    console.log(`Sauvegarde créée : ${dir}`);
    console.log(`Taille : ${(manifest.size / 1024).toFixed(0)} Ko · SHA-256 : ${manifest.sha256.slice(0, 16)}…`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  conn.sqlite.close();
}
