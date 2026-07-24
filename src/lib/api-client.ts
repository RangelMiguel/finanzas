import { applyOptimisticWrite, getHttpCache, putHttpCache } from "./offline/cache";
import { createClientId } from "./offline/ids";
import { enqueueOutbox } from "./offline/outbox";
import {
  isBrowserOffline,
  isCacheableGet,
  isNetworkError,
  isOnlineOnlyPath,
  isQueueableMutation,
  isWriteMethod,
} from "./offline/policy";
import { flushOutbox, requestBackgroundSync } from "./offline/sync";

export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineError";
  }
}

async function rawFetch<T>(
  path: string,
  opts?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers = new Headers(opts?.headers);
  let body = opts?.body;
  if (opts?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, {
    ...opts,
    headers,
    body,
    credentials: "include",
  });
  const contentType = res.headers.get("content-type") || "";
  if (
    contentType.includes("application/octet-stream") ||
    (contentType.includes("application/json") === false &&
      res.ok &&
      opts?.method === "POST" &&
      path.includes("export"))
  ) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Error de red");
    }
    return res as unknown as T;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || "Error");
  }
  return data as T;
}

/**
 * App-wide API helper with offline support:
 * - GETs are cached in IndexedDB and served offline when possible
 * - Queueable writes go to an outbox when offline and auto-sync later
 */
export async function api<T = unknown>(
  path: string,
  opts?: RequestInit & { json?: unknown }
): Promise<T> {
  const method = (opts?.method || "GET").toUpperCase();
  const isWrite = isWriteMethod(method);

  // ── Online-only paths while offline ───────────────────────────────────
  if (isBrowserOffline() && isOnlineOnlyPath(path) && isWrite) {
    throw new OfflineError(
      "Esta acción requiere conexión a internet."
    );
  }

  // ── GET: network first, cache fallback ────────────────────────────────
  if (!isWrite) {
    if (isBrowserOffline()) {
      if (isCacheableGet(path)) {
        try {
          const cached = await getHttpCache(path);
          if (cached != null) return cached as T;
        } catch {
          /* IDB fail */
        }
      }
      throw new OfflineError(
        "Sin conexión y no hay datos guardados para esta pantalla. Ábrela una vez en línea."
      );
    }

    try {
      const data = await rawFetch<T>(path, opts);
      if (isCacheableGet(path)) {
        try {
          await putHttpCache(path, data);
        } catch {
          /* ignore cache write errors */
        }
      }
      return data;
    } catch (e) {
      if (isNetworkError(e) && isCacheableGet(path)) {
        try {
          const cached = await getHttpCache(path);
          if (cached != null) return cached as T;
        } catch {
          /* ignore */
        }
      }
      throw e;
    }
  }

  // ── Writes: try network; queue if offline / network fail ─────────────
  const queueable = isQueueableMutation(path, method);

  if (isBrowserOffline() && queueable) {
    return enqueueAndReturn<T>(path, method, opts?.json);
  }

  if (isBrowserOffline() && !queueable) {
    throw new OfflineError("Esta acción requiere conexión a internet.");
  }

  try {
    // Ensure creates carry a stable client id for idempotency / offline
    let json = opts?.json;
    let clientMutationId: string | undefined;
    if (
      method === "POST" &&
      json &&
      typeof json === "object" &&
      !Array.isArray(json)
    ) {
      const obj = { ...(json as Record<string, unknown>) };
      if (!obj.clientMutationId) {
        obj.clientMutationId = createClientId();
      }
      clientMutationId = String(obj.clientMutationId);
      // Optional client-generated primary key when not present
      if (!obj.id && shouldAttachClientId(path)) {
        obj.id = createClientId();
      }
      json = obj;
    }

    const headers = new Headers(opts?.headers);
    if (clientMutationId) {
      headers.set("Idempotency-Key", clientMutationId);
    }

    const data = await rawFetch<T>(path, { ...opts, method, json, headers });

    // Best-effort: invalidate related caches so next GET is fresh
    try {
      const { invalidateHttpCache } = await import("./offline/cache");
      await invalidateHttpCache(path.split("?")[0]);
    } catch {
      /* ignore */
    }

    return data;
  } catch (e) {
    if (queueable && isNetworkError(e)) {
      return enqueueAndReturn<T>(path, method, opts?.json);
    }
    throw e;
  }
}

function shouldAttachClientId(path: string): boolean {
  const p = path.split("?")[0];
  return (
    p === "/api/transactions" ||
    p === "/api/personal/expenses" ||
    p === "/api/personal/incomes" ||
    p === "/api/personal/budgets" ||
    p === "/api/personal/allocations" ||
    p === "/api/accounts" ||
    p === "/api/categories" ||
    p === "/api/credit-cards" ||
    p === "/api/debts" ||
    p === "/api/goals" ||
    p === "/api/budgets" ||
    p === "/api/recurring" ||
    p === "/api/allowances"
  );
}

async function enqueueAndReturn<T>(
  path: string,
  method: string,
  body: unknown
): Promise<T> {
  const clientMutationId = createClientId();
  let payload = body;
  let clientId: string | undefined;

  if (method === "POST" && body && typeof body === "object" && !Array.isArray(body)) {
    const obj = { ...(body as Record<string, unknown>) };
    if (!obj.clientMutationId) obj.clientMutationId = clientMutationId;
    if (!obj.id && shouldAttachClientId(path)) {
      obj.id = createClientId();
    }
    clientId = typeof obj.id === "string" ? obj.id : undefined;
    payload = obj;
  }

  const optimistic = await applyOptimisticWrite({
    method,
    path,
    body: payload,
    clientId,
  });

  let mutationId = clientMutationId;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { clientMutationId?: unknown }).clientMutationId ===
      "string"
  ) {
    mutationId = String(
      (payload as { clientMutationId: string }).clientMutationId
    );
  }

  await enqueueOutbox({
    method,
    path,
    body: payload ?? null,
    clientMutationId: mutationId,
    optimisticResponse: optimistic,
  });

  void requestBackgroundSync();
  // Kick a flush in case we flapped online
  if (!isBrowserOffline()) void flushOutbox();

  return optimistic as T;
}

/** Force sync now (banner button). */
export async function syncNow() {
  return flushOutbox();
}
