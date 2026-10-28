import type { MemoryEntry, VectorRecord } from "../../types/memory.js";

const DB_NAME = "chromeaimemory";
const DB_VERSION = 1;
const ENTRIES = "entries";
const VECTORS = "vectors";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES)) {
        const store = db.createObjectStore(ENTRIES, { keyPath: "id" });
        store.createIndex("by_enabled", "enabled", { unique: false });
        store.createIndex("by_kind", "kind", { unique: false });
        store.createIndex("by_updated", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(VECTORS)) {
        db.createObjectStore(VECTORS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB tx aborted"));
  });
}

export async function putEntry(entry: MemoryEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ENTRIES, "readwrite");
  tx.objectStore(ENTRIES).put(entry);
  await txDone(tx);
  db.close();
}

export async function getEntry(id: string): Promise<MemoryEntry | undefined> {
  const db = await openDb();
  const tx = db.transaction(ENTRIES, "readonly");
  const result = await reqToPromise(
    tx.objectStore(ENTRIES).get(id) as IDBRequest<MemoryEntry | undefined>
  );
  db.close();
  return result;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([ENTRIES, VECTORS], "readwrite");
  tx.objectStore(ENTRIES).delete(id);
  tx.objectStore(VECTORS).delete(id);
  await txDone(tx);
  db.close();
}

export async function listEntries(): Promise<MemoryEntry[]> {
  const db = await openDb();
  const tx = db.transaction(ENTRIES, "readonly");
  const result = await reqToPromise(
    tx.objectStore(ENTRIES).getAll() as IDBRequest<MemoryEntry[]>
  );
  db.close();
  return result ?? [];
}

export async function countEntries(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(ENTRIES, "readonly");
  const result = await reqToPromise(tx.objectStore(ENTRIES).count());
  db.close();
  return result;
}

export async function putVector(record: VectorRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(VECTORS, "readwrite");
  tx.objectStore(VECTORS).put(record);
  await txDone(tx);
  db.close();
}

export async function getVector(id: string): Promise<VectorRecord | undefined> {
  const db = await openDb();
  const tx = db.transaction(VECTORS, "readonly");
  const result = await reqToPromise(
    tx.objectStore(VECTORS).get(id) as IDBRequest<VectorRecord | undefined>
  );
  db.close();
  return result;
}

export async function listVectors(): Promise<VectorRecord[]> {
  const db = await openDb();
  const tx = db.transaction(VECTORS, "readonly");
  const result = await reqToPromise(
    tx.objectStore(VECTORS).getAll() as IDBRequest<VectorRecord[]>
  );
  db.close();
  return result ?? [];
}

export async function wipeAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([ENTRIES, VECTORS], "readwrite");
  tx.objectStore(ENTRIES).clear();
  tx.objectStore(VECTORS).clear();
  await txDone(tx);
  db.close();
}

export async function importEntries(entries: MemoryEntry[]): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(ENTRIES, "readwrite");
  const store = tx.objectStore(ENTRIES);
  for (const e of entries) store.put(e);
  await txDone(tx);
  db.close();
  return entries.length;
}
