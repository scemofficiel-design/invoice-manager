#!/usr/bin/env node
/**
 * Démarrage de l'application compilée : build si nécessaire, lancement du serveur,
 * attente de disponibilité, ouverture du navigateur, arrêt propre (Ctrl+C).
 *   npm start                → profil prod
 *   npm start -- --no-open   → sans ouvrir le navigateur
 *   IM_PROFILE=demo npm start
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverJs = join(root, 'backend', 'dist', 'server.js');
const indexHtml = join(root, 'frontend', 'dist', 'index.html');
const profile = process.env.IM_PROFILE ?? 'prod';
const port = Number(process.env.PORT ?? { prod: 4300, dev: 4310, demo: 4320 }[profile] ?? 4300);
const url = `http://127.0.0.1:${port}`;
const shouldOpen = !process.argv.includes('--no-open');

if (!existsSync(serverJs) || !existsSync(indexHtml) || process.argv.includes('--build')) {
  console.log('Compilation de l’application…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Jeune génération V8 réduite : empreinte mémoire ~100 Mo au lieu de ~260 Mo (machine cible : 8 Go).
const child = spawn(process.execPath, ['--max-semi-space-size=4', serverJs], { cwd: root, stdio: 'inherit', env: { ...process.env, IM_PROFILE: profile, PORT: String(port) } });
const forward = (sig) => () => child.kill(sig);
process.on('SIGINT', forward('SIGINT'));
process.on('SIGTERM', forward('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      /* serveur pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

if (await waitForHealth()) {
  console.log(`\n  Invoice Manager est prêt : ${url}\n  Ctrl+C pour arrêter.\n`);
  if (shouldOpen) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
} else if (child.exitCode === null) {
  console.error('Le serveur ne répond pas. Consultez les messages ci-dessus.');
}
