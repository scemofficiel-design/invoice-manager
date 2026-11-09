import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { CSRF_HEADER, SESSION_COOKIE } from '@im/shared/constants';
import { createApp } from '../app';
import { loadConfig } from '../config/index';

export interface TestCtx {
  app: FastifyInstance;
  dataDir: string;
  close: () => Promise<void>;
}

/** Application isolée sur une base temporaire (jamais les données réelles). */
export async function makeApp(opts: { loginRateLimit?: number } = {}): Promise<TestCtx> {
  const dataDir = mkdtempSync(join(tmpdir(), 'im-test-'));
  const app = await createApp(loadConfig({ profile: 'test', dataDir, staticDir: null }), { loginRateLimit: opts.loginRateLimit ?? 0 });
  return {
    app,
    dataDir,
    close: async () => {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export class Client {
  cookie: string | null = null;
  constructor(private app: FastifyInstance) {}

  async req(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({
      method,
      url: `/api/v1${url}`,
      payload: body as object | undefined,
      headers: {
        ...(method !== 'GET' ? { [CSRF_HEADER]: '1' } : {}),
        ...(this.cookie ? { cookie: `${SESSION_COOKIE}=${this.cookie}` } : {}),
        ...headers,
      },
    });
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE);
    if (set) this.cookie = set.value || null;
    return res;
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body?: unknown) => this.req('POST', url, body ?? {});
  patch = (url: string, body: unknown) => this.req('PATCH', url, body);
  put = (url: string, body: unknown) => this.req('PUT', url, body);
  del = (url: string) => this.req('DELETE', url);
}

export const OWNER = { organizationName: 'Org Test', displayName: 'Propriétaire', email: 'owner@test.local', password: 'motdepasse123' };

export async function setupOwner(app: FastifyInstance): Promise<Client> {
  const c = new Client(app);
  const r = await c.post('/auth/setup', OWNER);
  if (r.statusCode !== 201) throw new Error(`setup: ${r.body}`);
  return c;
}

export const companyInput = (legalName: string, extra: Record<string, unknown> = {}) => ({
  legalName,
  defaultCurrency: 'CAD',
  taxPreset: 'ca-qc',
  ...extra,
});
