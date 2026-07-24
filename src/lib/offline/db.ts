const DB_NAME = "mf-offline";
const DB_VERSION = 1;

export type OutboxStatus = "pending" | "syncing" | "failed";

export type OutboxItem = {
  id: string;
  method: string;
  path: string;
  body: unknown;
  clientMutationId: string;
  createdAt: number;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  /** Optimistic payload returned to the UI when enqueued */
  optimisticResponse?: unknown;
};

export type HttpCacheEntry = {
  key: string;
  data: unknown;
  fetchedAt: number;
};

export type IdMapEntry = {
  tempId: string;
  serverId: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) {
        const store = db.createObjectStore("outbox", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("httpCache")) {
        db.createObjectStore("httpCache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("idMap")) {
        db.createObjectStore("idMap", { keyPath: "tempId" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB tx failed"));
    tx.onabort = () => reject(tx.error || new Error("IDB tx aborted"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB request failed"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await getDb();
  const tx = db.transaction(store, "readonly");
  const result = await reqToPromise<T | undefined>(tx.objectStore(store).get(key));
  await txDone(tx);
  return result;
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await getDb();
  const tx = db.transaction(store, "readonly");
  const result = await reqToPromise<T[]>(tx.objectStore(store).getAll());
  await txDone(tx);
  return result || [];
}

export async function idbClear(store: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}

export async function clearAllOfflineData(): Promise<void> {
  try {
    await Promise.all([
      idbClear("outbox"),
      idbClear("httpCache"),
      idbClear("idMap"),
      idbClear("meta"),
    ]);
  } catch {
    /* ignore if IDB unavailable */
  }
}
