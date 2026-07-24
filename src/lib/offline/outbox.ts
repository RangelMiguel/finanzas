import {
  type OutboxItem,
  type OutboxStatus,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from "./db";
import { createClientId } from "./ids";

const MAX_OUTBOX = 500;

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await idbGetAll<OutboxItem>("outbox");
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPending(): Promise<number> {
  const items = await listOutbox();
  return items.filter((i) => i.status === "pending" || i.status === "syncing")
    .length;
}

export async function enqueueOutbox(input: {
  method: string;
  path: string;
  body: unknown;
  optimisticResponse?: unknown;
  clientMutationId?: string;
}): Promise<OutboxItem> {
  const all = await listOutbox();
  if (all.length >= MAX_OUTBOX) {
    throw new Error(
      "Cola offline llena (500). Conéctate para sincronizar antes de seguir."
    );
  }

  const item: OutboxItem = {
    id: createClientId(),
    method: input.method.toUpperCase(),
    path: input.path,
    body: input.body,
    clientMutationId: input.clientMutationId || createClientId(),
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
    optimisticResponse: input.optimisticResponse,
  };
  await idbPut("outbox", item);
  notifyOutboxChanged();
  return item;
}

export async function updateOutbox(
  id: string,
  patch: Partial<Pick<OutboxItem, "status" | "attempts" | "lastError">>
): Promise<void> {
  const item = await idbGet<OutboxItem>("outbox", id);
  if (!item) return;
  await idbPut("outbox", { ...item, ...patch });
  notifyOutboxChanged();
}

export async function removeOutbox(id: string): Promise<void> {
  await idbDelete("outbox", id);
  notifyOutboxChanged();
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  return idbGet<OutboxItem>("outbox", id);
}

export async function discardFailed(id: string): Promise<void> {
  const item = await idbGet<OutboxItem>("outbox", id);
  if (item && item.status === "failed") {
    await removeOutbox(id);
  }
}

export async function retryFailed(id: string): Promise<void> {
  const item = await idbGet<OutboxItem>("outbox", id);
  if (!item) return;
  await idbPut("outbox", {
    ...item,
    status: "pending" as OutboxStatus,
    lastError: undefined,
  });
  notifyOutboxChanged();
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onOutboxChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyOutboxChanged() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mf-outbox-change"));
  }
}
