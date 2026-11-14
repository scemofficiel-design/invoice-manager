/**
 * Magasin de fichiers volumineux (documents importés), séparé de la base SQLite pour que les
 * enregistrements restent rapides sur l'iPhone. Fourni par l'environnement :
 *  - application iPhone : IndexedDB (frontend/src/local/store.ts) ;
 *  - banc de test Node : mémoire.
 */
export interface BlobStore {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<void>;
}

let store: BlobStore | null = null;

export function setBlobStore(s: BlobStore): void {
  store = s;
}

export function blobStore(): BlobStore {
  if (!store) throw new Error('Aucun magasin de fichiers configuré');
  return store;
}

export function memoryBlobStore(): BlobStore & { size(): number } {
  const m = new Map<string, Uint8Array>();
  return {
    put: async (k, d) => void m.set(k, new Uint8Array(d)),
    get: async (k) => m.get(k),
    delete: async (k) => void m.delete(k),
    size: () => m.size,
  };
}
