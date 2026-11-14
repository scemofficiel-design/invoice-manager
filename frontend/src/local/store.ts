/**
 * Stockage persistant sur l'appareil (IndexedDB). La base complète y est enregistrée après chaque
 * modification. Rien n'est jamais envoyé sur le réseau.
 */
const DB_NAME = 'invoice-manager';
const STORE = 'kv';
/** Fichiers importés (anciennes factures), séparés de la base pour garder des enregistrements rapides. */
const FILES = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(FILES)) req.result.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void, store = STORE): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => {
      db.close();
      resolve(r ? (r.result as T) : undefined);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const kvGet = <T>(key: string) => tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
export const kvSet = (key: string, value: unknown) => tx('readwrite', (s) => void s.put(value, key));
export const kvDelete = (key: string) => tx('readwrite', (s) => void s.delete(key));

export const fileGet = (key: string) => tx<Uint8Array>('readonly', (s) => s.get(key) as IDBRequest<Uint8Array>, FILES);
export const filePut = (key: string, data: Uint8Array) => tx('readwrite', (s) => void s.put(data, key), FILES);
export const fileDelete = (key: string) => tx('readwrite', (s) => void s.delete(key), FILES);

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
