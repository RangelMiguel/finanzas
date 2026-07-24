export async function api<T = unknown>(
  path: string,
  opts?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers = new Headers(opts?.headers);
  let body = opts?.body;
  if (opts?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, { ...opts, headers, body, credentials: "include" });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/octet-stream") || contentType.includes("application/json") === false && res.ok && opts?.method === "POST" && path.includes("export")) {
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
