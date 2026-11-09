#!/usr/bin/env node
// Lance un outil en ligne de commande du backend (version compilée si disponible, sinon sources via tsx).
//   npm run backup [-- --export [dossier]] · npm run restore [-- <nom|archive>] · npm run reset-password -- <email>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [tool, ...args] = process.argv.slice(2);
const built = join(root, 'backend', 'dist', 'cli', `${tool}.js`);
const src = join(root, 'backend', 'src', 'cli', `${tool}.ts`);
if (!existsSync(built) && !existsSync(src)) {
  console.error(`Outil inconnu : ${tool}`);
  process.exit(1);
}
const r = existsSync(built)
  ? spawnSync(process.execPath, [built, ...args], { cwd: root, stdio: 'inherit' })
  : spawnSync(join(root, 'node_modules', '.bin', 'tsx'), [src, ...args], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
