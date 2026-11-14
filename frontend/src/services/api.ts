/**
 * Accès aux données. L'application est 100 % locale : les « appels API » sont traités par le
 * moteur local (local/runtime.ts) dans l'appareil, sans aucune requête réseau.
 */
import { API_PREFIX } from '@im/shared/constants';
import { localApp } from '@/local/runtime';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function call(method: Method, path: string, body?: unknown) {
  const res = await localApp().inject(method, path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path, body);
  if (res.status >= 400) {
    const e = (res.body as { error?: { code?: string; message?: string; details?: { path: string; message: string }[] } })?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'UNKNOWN', e.message ?? 'Erreur', e.details);
  }
  return res;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  // JSON aller-retour : les écrans reçoivent des copies, jamais les objets internes du moteur.
  const res = await call(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
  return (res.body === undefined ? undefined : JSON.parse(JSON.stringify(res.body))) as T;
}

export interface FileResult {
  data: Uint8Array;
  mime: string;
  filename: string;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T = void>(p: string) => request<T>('DELETE', p),
  /** Fichier binaire (PDF, logo). */
  file: async (p: string): Promise<FileResult> => {
    const res = await call('GET', p);
    const disp = res.headers['content-disposition'] ?? '';
    return { data: res.body as Uint8Array, mime: res.headers['content-type'] ?? 'application/octet-stream', filename: /filename="([^"]+)"/.exec(disp)?.[1] ?? 'document' };
  },
};
