"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Alert = {
  id: string;
  type: string;
  severity: string;
  summary: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
};

const POLL_MS = 20_000;

export function SecurityNotifications() {
  const { t, ready } = useApp();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [mounted, setMounted] = useState(false);
  const sinceRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(
    async (since?: string | null) => {
      if (loadingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      loadingRef.current = true;
      try {
        const q = since
          ? `?since=${encodeURIComponent(since)}&limit=30`
          : "?limit=30";
        const res = await api<{
          alerts: Alert[];
          unreadCount: number;
          serverTime: string;
        }>(`/api/security/alerts${q}`);

        if (since) {
          if (res.alerts.length) {
            setAlerts((prev) => {
              const ids = new Set(prev.map((a) => a.id));
              const fresh = res.alerts.filter((a) => !ids.has(a.id));
              if (fresh[0] && !open) {
                // Light toast only when panel closed
                toast.message(fresh[0].summary, {
                  description: t.security.monitoringLive,
                  duration: 3500,
                });
              }
              return [...fresh, ...prev].slice(0, 40);
            });
          }
        } else {
          setAlerts(res.alerts);
        }
        setUnread(res.unreadCount);
        sinceRef.current = res.serverTime;
      } catch {
        /* not logged in or no household */
      } finally {
        loadingRef.current = false;
      }
    },
    [t.security.monitoringLive, open]
  );

  useEffect(() => {
    if (!ready) return;
    load(null);
    const id = setInterval(() => {
      // When panel open, full refresh less often; when closed, only poll deltas
      load(sinceRef.current);
    }, POLL_MS);

    function onVis() {
      if (document.visibilityState === "visible") {
        load(sinceRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDoc(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        // ignore clicks on the bell button (handled by toggle)
        const bell = (e.target as HTMLElement)?.closest?.("[data-sec-bell]");
        if (bell) return;
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  async function markSeen() {
    try {
      await api("/api/security/alerts", { method: "POST" });
      setUnread(0);
    } catch {
      /* ignore */
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load(null);
      await markSeen();
    }
  }

  const panel = open && (
    <>
      {/* Scrim — solid-ish so content underneath doesn't show through on mobile */}
      <button
        type="button"
        className="security-notif-scrim"
        aria-label={t.close}
        onClick={() => setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.security.monitoringTitle}
        className="security-notif-panel"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">
              {t.security.monitoringTitle}
            </div>
            <div className="text-[11px] text-[var(--fg-muted)]">
              {t.security.monitoringInApp}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={t.close}
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ul className="security-notif-list">
          {alerts.length === 0 ? (
            <li className="px-1 py-6 text-center text-sm text-[var(--fg-faint)]">
              {t.security.monitoringEmpty}
            </li>
          ) : (
            alerts.map((a) => (
              <li key={a.id} className="security-notif-item">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className={
                      a.severity === "critical"
                        ? "font-semibold text-red-300"
                        : a.severity === "warning"
                          ? "font-semibold text-amber-200"
                          : "font-semibold text-sky-200"
                    }
                  >
                    {a.severity}
                  </span>
                  <span className="text-[var(--fg-faint)]">{a.type}</span>
                  <span className="text-[var(--fg-faint)]">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-0.5 font-medium leading-snug text-white">
                  {a.summary}
                </div>
                {a.detail && (
                  <div className="mt-0.5 text-[12px] text-[var(--fg-muted)]">
                    {a.detail}
                  </div>
                )}
                {a.ip && (
                  <div className="text-[11px] text-[var(--fg-faint)]">IP {a.ip}</div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );

  return (
    <div className="relative" data-sec-bell>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={t.security.monitoringTitle}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
