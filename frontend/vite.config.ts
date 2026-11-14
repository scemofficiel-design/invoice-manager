import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages sert l'application sous /<nom-du-dépôt>/ ; en local, à la racine.
const base = process.env.BASE_PATH ?? '/';

/**
 * Après la compilation : génère le service worker (liste exacte des fichiers à garder hors
 * connexion, versionnée par empreinte) et 404.html (liens directs sur GitHub Pages).
 */
function offlinePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'offline-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const urls = files.filter((f) => f !== 'sw.js' && f !== '404.html').map((f) => (f === 'index.html' ? base : base + f));
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);
      const sw = `// Généré à la compilation — garde l'application disponible hors connexion.
const CACHE = 'invoice-manager-${version}';
const BASE = ${JSON.stringify(base)};
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('invoice-manager-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Page : réseau d'abord (mises à jour), application en cache hors connexion.
    e.respondWith(fetch(req).catch(() => caches.match(BASE)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      writeFileSync(join(outDir, 'sw.js'), sw);
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), offlinePlugin()],
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@backend': fileURLToPath(new URL('../backend/src', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
