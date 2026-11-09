import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Profile = 'prod' | 'dev' | 'demo' | 'test';

export interface AppConfig {
  profile: Profile;
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  documentsDir: string;
  backupsDir: string;
  logsDir: string;
  migrationsDir: string;
  /** Répertoire du frontend compilé (servi en production) ; null en dev. */
  staticDir: string | null;
  version: string;
  logLevel: string;
  /** Sauvegarde automatique au démarrage / périodique. Désactivée en test. */
  autoBackup: boolean;
}

const APP_DIR_NAMES: Record<Profile, string> = {
  prod: 'InvoiceManager',
  dev: 'InvoiceManager-dev',
  demo: 'InvoiceManager-demo',
  test: 'InvoiceManager-test',
};

const DEFAULT_PORTS: Record<Profile, number> = { prod: 4300, dev: 4310, demo: 4320, test: 0 };

export function defaultDataDir(profile: Profile): string {
  const base =
    platform() === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : platform() === 'win32'
        ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
        : (process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'));
  return join(base, APP_DIR_NAMES[profile]);
}

const here = dirname(fileURLToPath(import.meta.url));

/** Cherche un répertoire parmi plusieurs emplacements (sources en dev, dist une fois compilé). */
function firstExisting(candidates: string[]): string | null {
  return candidates.find((c) => existsSync(c)) ?? null;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  // Fichiers créés (base, sauvegardes, PDF) lisibles uniquement par l'utilisateur courant.
  process.umask(0o077);
  const profile = (overrides.profile ?? (process.env.IM_PROFILE as Profile | undefined) ?? 'prod') as Profile;
  if (!(profile in APP_DIR_NAMES)) throw new Error(`Profil inconnu : ${profile}`);
  const dataDir = resolve(overrides.dataDir ?? process.env.INVOICE_MANAGER_DATA_DIR ?? defaultDataDir(profile));
  const migrationsDir =
    overrides.migrationsDir ??
    firstExisting([resolve(here, '../../migrations'), resolve(here, './migrations'), resolve(here, '../migrations')]);
  if (!migrationsDir) throw new Error('Répertoire des migrations introuvable');
  const staticDir =
    overrides.staticDir !== undefined
      ? overrides.staticDir
      : firstExisting([resolve(here, '../../frontend/dist'), resolve(here, '../../../frontend/dist')]);
  const host = overrides.host ?? process.env.IM_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && process.env.IM_ALLOW_LAN !== '1') {
    // Le mode réseau local est désactivé par défaut (ARCHITECTURE.md §10).
    throw new Error('Écoute hors de 127.0.0.1 refusée : le mode réseau local n’est pas activé');
  }
  return {
    profile,
    host,
    port: overrides.port ?? (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORTS[profile]),
    dataDir,
    dbPath: join(dataDir, 'data', 'invoice-manager.db'),
    documentsDir: join(dataDir, 'documents'),
    backupsDir: join(dataDir, 'backups'),
    logsDir: join(dataDir, 'logs'),
    migrationsDir,
    staticDir: profile === 'dev' ? null : staticDir,
    version: overrides.version ?? process.env.npm_package_version ?? '0.1.0',
    logLevel: overrides.logLevel ?? process.env.LOG_LEVEL ?? (profile === 'test' ? 'silent' : 'info'),
    autoBackup: overrides.autoBackup ?? profile !== 'test',
  };
}
