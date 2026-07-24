import { invalidateHttpCache } from "./cache";
import {
  listOutbox,
  removeOutbox,
  updateOutbox,
  countPending,
  onOutboxChange,
} from "./outbox";
import { isBrowserOffline } from "./policy";
import { idbGetAll, idbPut, type IdMapEntry } from "./db";

export type SyncState = {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastError: string | null;
  authRequired: boolean;
};

type SyncListener = (state: SyncState) => void;

let syncing = false;
let lastError: string | null = null;
let authRequired = false;
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<SyncListener>();

async function currentState(): Promise<SyncState> {
  let pending = 0;
  try {
    pending = await countPending();
  } catch {
    pending = 0;
  }
  return {
    online: !isBrowserOffline(),
    pending,
    syncing,
    lastError,
    authRequired,
  };
}

async function emit() {
  const state = await currentState();
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeSync(fn: SyncListener): () => void {
  listeners.add(fn);
  void currentState().then(fn);
  return () => listeners.delete(fn);
}

export async function getSyncState(): Promise<SyncState> {
  return currentState();
}

function rewriteBodyIds(body: unknown, map: Map<string, string>): unknown {
  if (body == null) return body;
  if (typeof body === "string") {
    return map.get(body) || body;
  }
  if (Array.isArray(body)) {
    return body.map((x) => rewriteBodyIds(x, map));
  }
  if (typeof body === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = rewriteBodyIds(v, map);
    }
    return out;
  }
  return body;
}

async function loadIdMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const entries = await idbGetAll<IdMapEntry>("idMap");
    for (const e of entries) map.set(e.tempId, e.serverId);
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * Flush the outbox FIFO. Safe to call often; concurrent calls coalesce.
 */
export async function flushOutbox(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  if (isBrowserOffline()) {
    await emit();
    return { synced: 0, failed: 0, remaining: await countPending() };
  }
  if (syncing) {
    return { synced: 0, failed: 0, remaining: await countPending() };
  }

  syncing = true;
  lastError = null;
  await emit();

  let synced = 0;
  let failed = 0;

  try {
    const items = (await listOutbox()).filter(
      (i) => i.status === "pending" || i.status === "failed"
    );
    const idMap = await loadIdMap();

    for (const item of items) {
      if (isBrowserOffline()) break;

      await updateOutbox(item.id, {
        status: "syncing",
        attempts: item.attempts + 1,
      });

      try {
        let path = item.path;
        // rewrite query id=temp
        for (const [temp, server] of idMap) {
          path = path.replace(temp, server);
        }
        const body = rewriteBodyIds(item.body, idMap);
        const headers: Record<string, string> = {
          "Idempotency-Key": item.clientMutationId,
        };
        let fetchBody: string | undefined;
        if (body !== undefined && body !== null && item.method !== "GET") {
          headers["Content-Type"] = "application/json";
          // Attach clientMutationId into JSON when object
          if (typeof body === "object" && !Array.isArray(body)) {
            fetchBody = JSON.stringify({
              ...(body as object),
              clientMutationId: item.clientMutationId,
            });
          } else {
            fetchBody = JSON.stringify(body);
          }
        }

        const res = await fetch(path, {
          method: item.method,
          headers,
          body: fetchBody,
          credentials: "include",
        });

        if (res.status === 401) {
          authRequired = true;
          lastError = "auth";
          await updateOutbox(item.id, {
            status: "pending",
            lastError: "No autenticado",
          });
          break;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // 4xx (except 401/408/429): permanent fail for this item
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            failed++;
            await updateOutbox(item.id, {
              status: "failed",
              lastError: (data as { error?: string }).error || res.statusText,
            });
            continue;
          }
          throw new Error(
            (data as { error?: string }).error || res.statusText || "Error de red"
          );
        }

        // Map optimistic id → server id when possible
        const serverEntity =
          (data as { transaction?: { id?: string } }).transaction ||
          (data as { expense?: { id?: string } }).expense ||
          (data as { income?: { id?: string } }).income ||
          (data as { account?: { id?: string } }).account ||
          (data as { debt?: { id?: string } }).debt ||
          (data as { goal?: { id?: string } }).goal ||
          (data as { budget?: { id?: string } }).budget ||
          (data as { id?: string });
        const serverId =
          serverEntity && typeof serverEntity === "object"
            ? (serverEntity as { id?: string }).id
            : undefined;
        const tempId =
          item.optimisticResponse &&
          typeof item.optimisticResponse === "object" &&
          "id" in (item.optimisticResponse as object)
            ? String((item.optimisticResponse as { id: string }).id)
            : undefined;
        if (tempId && serverId && tempId !== serverId) {
          await idbPut("idMap", { tempId, serverId } satisfies IdMapEntry);
          idMap.set(tempId, serverId);
        }

        await removeOutbox(item.id);
        synced++;
        authRequired = false;

        // Invalidate caches for this resource so next GET is fresh
        const base = item.path.split("?")[0];
        await invalidateHttpCache(base);
        await invalidateHttpCache("/api/dashboard");
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Error de sync";
        await updateOutbox(item.id, {
          status: "pending",
          lastError,
        });
        // Network blip: stop and retry later
        break;
      }
    }
  } finally {
    syncing = false;
    await emit();
  }

  const remaining = await countPending();
  return { synced, failed, remaining };
}

export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};
  if (started) return () => {};
  started = true;

  const onOnline = () => {
    void flushOutbox();
  };
  const onOffline = () => {
    void emit();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible" && !isBrowserOffline()) {
      void flushOutbox();
    }
  };
  const onOutbox = () => {
    void emit();
    if (!isBrowserOffline()) void flushOutbox();
  };
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "mf-flush-outbox") {
      void flushOutbox();
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("mf-outbox-change", onOutbox);
  navigator.serviceWorker?.addEventListener?.("message", onMessage);
  const unsubOutbox = onOutboxChange(() => void emit());

  intervalId = setInterval(() => {
    if (!isBrowserOffline()) void flushOutbox();
  }, 30_000);

  // Initial
  void emit();
  if (!isBrowserOffline()) void flushOutbox();

  // Register Background Sync if available
  void (async () => {
    try {
      const reg = await navigator.serviceWorker?.ready;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const syncManager = (reg as any)?.sync;
      if (syncManager?.register) {
        await syncManager.register("mf-outbox");
      }
    } catch {
      /* unsupported */
    }
  })();

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("mf-outbox-change", onOutbox);
    navigator.serviceWorker?.removeEventListener?.("message", onMessage);
    unsubOutbox();
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  };
}

/** Ensure SW registers a background sync when we enqueue. */
export async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncManager = (reg as any)?.sync;
    if (syncManager?.register) {
      await syncManager.register("mf-outbox");
    }
  } catch {
    /* ignore */
  }
}

