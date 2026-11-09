import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout : application compilée, base temporaire jetable (jamais les données réelles),
 * Chromium uniquement et un seul worker (machine cible : 8 Go de RAM).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4398', locale: 'fr-CA', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } }],
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:4398/api/health', reuseExistingServer: false, timeout: 60_000 },
});
