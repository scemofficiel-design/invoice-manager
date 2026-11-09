#!/usr/bin/env node
// Serveur pour les tests E2E : base temporaire créée puis supprimée à l'arrêt.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(join(tmpdir(), 'im-e2e-'));
const child = spawn(process.execPath, [join(root, 'backend', 'dist', 'server.js')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, IM_PROFILE: 'test', PORT: '4398', INVOICE_MANAGER_DATA_DIR: dataDir },
});
const stop = () => child.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
