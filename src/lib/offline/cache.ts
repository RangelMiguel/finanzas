import { type HttpCacheEntry, idbDelete, idbGet, idbGetAll, idbPut } from "./db";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function cacheKey(path: string): string {
  return path;
}

export async function putHttpCache(path: string, data: unknown): Promise<void> {
  const entry: HttpCacheEntry = {
    key: cacheKey(path),
    data,
    fetchedAt: Date.now(),
  };
  await idbPut("httpCache", entry);
}

export async function getHttpCache(
  path: string,
  opts?: { maxAgeMs?: number }
): Promise<unknown | null> {
  const entry = await idbGet<HttpCacheEntry>("httpCache", cacheKey(path));
  if (!entry) return null;
  const maxAge = opts?.maxAgeMs ?? DEFAULT_TTL_MS;
  if (Date.now() - entry.fetchedAt > maxAge) return null;
  return entry.data;
}

/** Invalidate all cache keys that start with a path prefix (ignore query). */
export async function invalidateHttpCache(prefix: string): Promise<void> {
  const base = prefix.split("?")[0];
  const all = await idbGetAll<HttpCacheEntry>("httpCache");
  await Promise.all(
    all
      .filter((e) => e.key === base || e.key.startsWith(base + "?") || e.key.startsWith(base + "/"))
      .map((e) => idbDelete("httpCache", e.key))
  );
}

/**
 * Apply a shallow optimistic mutation to any cached GET whose key matches
 * a resource list path. Best-effort; unknown shapes are left alone.
 */
export async function applyOptimisticWrite(opts: {
  method: string;
  path: string;
  body: unknown;
  clientId?: string;
}): Promise<unknown> {
  const method = opts.method.toUpperCase();
  const pathOnly = opts.path.split("?")[0];
  const body = (opts.body && typeof opts.body === "object"
    ? (opts.body as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  // Common list endpoints we can patch
  const listKeyHints: { match: RegExp; listField: string; entity?: string }[] = [
    { match: /^\/api\/transactions$/, listField: "transactions" },
    { match: /^\/api\/accounts$/, listField: "accounts" },
    { match: /^\/api\/categories$/, listField: "categories" },
    { match: /^\/api\/credit-cards$/, listField: "creditCards" },
    { match: /^\/api\/budgets$/, listField: "budgets" },
    { match: /^\/api\/debts$/, listField: "debts" },
    { match: /^\/api\/goals$/, listField: "goals" },
    { match: /^\/api\/recurring$/, listField: "recurring" },
    { match: /^\/api\/allowances$/, listField: "allowances" },
    { match: /^\/api\/personal\/expenses$/, listField: "expenses" },
    { match: /^\/api\/personal\/incomes$/, listField: "incomes" },
    { match: /^\/api\/personal\/budgets$/, listField: "budgets" },
    { match: /^\/api\/personal\/allocations$/, listField: "allocations" },
  ];

  const hint = listKeyHints.find((h) => h.match.test(pathOnly));
  const clientId =
    opts.clientId ||
    (typeof body.id === "string" ? body.id : undefined) ||
    `pending-${Date.now()}`;

  let optimistic: unknown = { ok: true, offline: true, id: clientId };

  if (hint) {
    const all = await idbGetAll<HttpCacheEntry>("httpCache");
    for (const entry of all) {
      const keyBase = entry.key.split("?")[0];
      if (keyBase !== pathOnly) continue;
      const data = entry.data as Record<string, unknown>;
      if (!data || typeof data !== "object") continue;
      const list = data[hint.listField];
      if (!Array.isArray(list)) continue;

      let nextList = [...list];
      if (method === "POST") {
        const row = {
          ...body,
          id: clientId,
          _offlinePending: true,
          createdAt: new Date().toISOString(),
          // money helpers often expect amountCents
          amountCents:
            body.amountCents ??
            (body.amount != null
              ? Math.round(Number(body.amount) * 100)
              : undefined),
        };
        nextList = [row, ...nextList];
        const entityKey = hint.listField.replace(/s$/, "") || "item";
        optimistic = {
          ...row,
          offline: true,
          ok: true,
          id: clientId,
          [entityKey]: row,
        };
      } else if (method === "PATCH" || method === "PUT") {
        const id = String(body.id || "");
        nextList = nextList.map((item) => {
          if (!item || typeof item !== "object") return item;
          const rec = item as Record<string, unknown>;
          if (String(rec.id) !== id) return item;
          return {
            ...rec,
            ...body,
            _offlinePending: true,
            amountCents:
              body.amountCents ??
              (body.amount != null
                ? Math.round(Number(body.amount) * 100)
                : rec.amountCents),
          };
        });
        optimistic = { ok: true, offline: true, id };
      } else if (method === "DELETE") {
        const urlId = new URL(opts.path, "http://local").searchParams.get("id");
        const id = urlId || String(body.id || "");
        nextList = nextList.filter((item) => {
          if (!item || typeof item !== "object") return true;
          return String((item as Record<string, unknown>).id) !== id;
        });
        optimistic = { ok: true, offline: true, id };
      }

      await idbPut("httpCache", {
        ...entry,
        data: { ...data, [hint.listField]: nextList },
        fetchedAt: Date.now(),
      });
    }
  } else {
    // Unknown resource: soft-invalidate related GETs so next online load is fresh
    await invalidateHttpCache(pathOnly);
    if (method === "POST") {
      optimistic = {
        ok: true,
        offline: true,
        id: clientId,
        ...(body || {}),
      };
    } else {
      optimistic = { ok: true, offline: true };
    }
  }

  // Dashboard / summary caches should refresh after money moves
  if (
    pathOnly.includes("transaction") ||
    pathOnly.includes("personal") ||
    pathOnly.includes("debt") ||
    pathOnly.includes("goal") ||
    pathOnly.includes("account") ||
    pathOnly.includes("budget") ||
    pathOnly.includes("catchup")
  ) {
    await invalidateHttpCache("/api/dashboard");
    await invalidateHttpCache("/api/personal/summary");
    await invalidateHttpCache("/api/safe-to-spend");
  }

  return optimistic;
}
