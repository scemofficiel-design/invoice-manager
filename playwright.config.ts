import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout de l'application iPhone, compilée exactement comme pour GitHub Pages
 * (sous /invoice-manager/). Chromium seul, un worker (machine cible : 8 Go de RAM).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/invoice-manager/', locale: 'fr-CA', trace: 'retain-on-failure', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: 'npm run build -w frontend && cd frontend && npx vite preview --port 4173 --strictPort',
    env: { BASE_PATH: '/invoice-manager/' },
    url: 'http://127.0.0.1:4173/invoice-manager/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
