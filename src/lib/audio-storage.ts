// Thin IndexedDB wrapper for persisting audio blobs across sessions.
// Internally stores `{ bytes: ArrayBuffer, type: string }` rather than the
// Blob directly — ArrayBuffer round-trips through structured clone reliably
// in both the browser and fake-indexeddb (which doesn't handle Blob cleanly
// under jsdom). Callers still work with Blob on both sides.

const DB_NAME = 'guitarguru-audio';
const DB_VERSION = 1;
const STORE = 'blobs';

interface StoredBlob {
  bytes: ArrayBuffer;
  type: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const bytes = await blobToArrayBuffer(blob);
  const stored: StoredBlob = { bytes, type: blob.type };
  await withStore('readwrite', (store) => store.put(stored, id));
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function getBlob(id: string): Promise<Blob | null> {
  const result = await withStore<StoredBlob | undefined>(
    'readonly',
    (store) => store.get(id) as IDBRequest<StoredBlob | undefined>,
  );
  if (!result) return null;
  return new Blob([result.bytes], { type: result.type });
}

export async function deleteBlob(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function listBlobIds(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys() as IDBRequest<IDBValidKey[]>);
  return keys.filter((k): k is string => typeof k === 'string');
}

/** Test-only hook to reset the shared db handle between tests. */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
