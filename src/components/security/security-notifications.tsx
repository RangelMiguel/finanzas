"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X, Trash2 } from "lucide-react";
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
  const bellRef = useRef<HTMLDivElement>(null);
  /** Ignore outside-close for a tick after opening (mobile ghost events). */
  const ignoreOutsideUntil = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(
    async (since?: string | null) => {
      if (loadingRef.current) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
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
              const important = fresh.find(
                (a) => a.severity === "warning" || a.severity === "critical"
              );
              if (important && !open) {
                toast.message(important.summary, {
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
        /* not logged in */
      } finally {
        loadingRef.current = false;
      }
    },
    [t.security.monitoringLive, open]
  );

  useEffect(() => {
    if (!ready) return;
    load(null);
    const id = setInterval(() => load(sinceRef.current), POLL_MS);
    function onVis() {
      if (document.visibilityState === "visible") load(sinceRef.current);
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

    function isOutside(target: EventTarget | null) {
      if (!(target instanceof Node)) return true;
      if (panelRef.current?.contains(target)) return false;
      if (bellRef.current?.contains(target)) return false;
      return true;
    }

    function onPointerDown(e: Event) {
      if (Date.now() < ignoreOutsideUntil.current) return;
      if (isOutside(e.target)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    // pointerdown covers mouse + touch without racing the open click
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  // Lock body scroll while tray is open (mobile)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function markSeen() {
    try {
      await api("/api/security/alerts", {
        method: "POST",
        json: { action: "seen" },
      });
      setUnread(0);
    } catch {
      /* ignore */
    }
  }

  async function dismissOne(id: string) {
    try {
      await api("/api/security/alerts", {
        method: "DELETE",
        json: { alertId: id },
      });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setUnread((u) => Math.max(0, u - 1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function dismissAll() {
    try {
      await api("/api/security/alerts", {
        method: "DELETE",
        json: { all: true },
      });
      setAlerts([]);
      setUnread(0);
      toast.success(t.security.dismissedAll);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function openTray() {
    ignoreOutsideUntil.current = Date.now() + 400;
    setOpen(true);
    // Fire-and-forget refresh; do not block UI open
    void load(null).then(() => markSeen());
  }

  function closeTray() {
    setOpen(false);
  }

  function toggle() {
    if (open) closeTray();
    else openTray();
  }

  const panel = open && (
    <>
      <button
        type="button"
        className="security-notif-scrim"
        aria-label={t.close}
        onClick={closeTray}
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
          <div className="flex shrink-0 items-center gap-1">
            {alerts.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[11px] text-rose-200"
                onClick={dismissAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.security.dismissAll}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.close}
              onClick={closeTray}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ul className="security-notif-list">
          {alerts.length === 0 ? (
            <li className="px-1 py-6 text-center text-sm text-[var(--fg-faint)]">
              {t.security.monitoringEmpty}
            </li>
          ) : (
            alerts.map((a) => (
              <li key={a.id} className="security-notif-item">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
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
                      <div className="text-[11px] text-[var(--fg-faint)]">
                        IP {a.ip}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-white/10 hover:text-white"
                    aria-label={t.security.dismiss}
                    onClick={() => dismissOne(a.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );

  return (
    <div className="relative" data-sec-bell ref={bellRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={t.security.monitoringTitle}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
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
