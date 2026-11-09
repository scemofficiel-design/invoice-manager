#!/usr/bin/env node
// Démonstration : base séparée (profil « demo »), créée au premier lancement, puis démarrage.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, IM_PROFILE: 'demo' };
if (!existsSync(join(root, 'backend', 'dist', 'cli', 'seed-demo.js')) || !existsSync(join(root, 'frontend', 'dist', 'index.html'))) {
  const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const seed = spawnSync(process.execPath, [join(root, 'backend', 'dist', 'cli', 'seed-demo.js')], { cwd: root, stdio: 'inherit', env });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const r = spawnSync(process.execPath, [join(root, 'scripts', 'start.mjs'), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env });
process.exit(r.status ?? 0);
