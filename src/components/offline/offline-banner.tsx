"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import {
  flushOutbox,
  startSyncEngine,
  subscribeSync,
  type SyncState,
} from "@/lib/offline/sync";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
  const { t, tr } = useApp();
  const [state, setState] = useState<SyncState>({
    online: true,
    pending: 0,
    syncing: false,
    lastError: null,
    authRequired: false,
  });

  useEffect(() => {
    const stop = startSyncEngine();
    const unsub = subscribeSync(setState);
    return () => {
      unsub();
      stop();
    };
  }, []);

  const show =
    !state.online ||
    state.pending > 0 ||
    state.authRequired ||
    (state.lastError && state.lastError !== "auth");

  if (!show) return null;

  let message = "";
  let tone: "warn" | "info" | "danger" = "info";

  if (!state.online) {
    message =
      state.pending > 0
        ? tr(t.offline.offlineWithPending, { n: state.pending })
        : t.offline.offline;
    tone = "warn";
  } else if (state.authRequired) {
    message = t.offline.authRequired;
    tone = "danger";
  } else if (state.syncing) {
    message = tr(t.offline.syncing, { n: state.pending || 1 });
    tone = "info";
  } else if (state.pending > 0) {
    message = tr(t.offline.pending, { n: state.pending });
    tone = "info";
  } else if (state.lastError) {
    message = tr(t.offline.syncError, { error: state.lastError });
    tone = "danger";
  }

  const bg =
    tone === "danger"
      ? "bg-rose-500/15 border-rose-400/30 text-rose-100"
      : tone === "warn"
        ? "bg-amber-500/15 border-amber-400/30 text-amber-50"
        : "bg-teal-500/15 border-teal-400/30 text-teal-50";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs ${bg}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!state.online ? (
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{message}</span>
      </div>
      {state.online && (state.pending > 0 || state.lastError) && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={state.syncing}
          onClick={() => void flushOutbox()}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${state.syncing ? "animate-spin" : ""}`}
          />
          {t.offline.syncNow}
        </Button>
      )}
    </div>
  );
}
