// Compile le backend en JavaScript (esbuild). Le code partagé (@im/shared) est intégré au bundle ;
// les dépendances npm restent externes (dont le module natif better-sqlite3).
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });

const externalDeps = {
  name: 'external-deps',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith('@im/') ? undefined : { path: args.path, external: true }));
  },
};

await build({
  entryPoints: {
    server: 'src/server.ts',
    'cli/backup': 'src/cli/backup.ts',
    'cli/restore': 'src/cli/restore.ts',
    'cli/reset-password': 'src/cli/reset-password.ts',
    'cli/seed-demo': 'src/cli/seed-demo.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  plugins: [externalDeps],
  logLevel: 'info',
});
