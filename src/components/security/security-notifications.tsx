"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function SecurityNotifications() {
  const { t, ready } = useApp();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const sinceRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (since?: string | null) => {
      try {
        const q = since
          ? `?since=${encodeURIComponent(since)}&limit=40`
          : "?limit=40";
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
              if (fresh[0]) {
                toast.message(fresh[0].summary, {
                  description: t.security.monitoringLive,
                });
              }
              return [...fresh, ...prev].slice(0, 60);
            });
          }
        } else {
          setAlerts(res.alerts);
        }
        setUnread(res.unreadCount);
        sinceRef.current = res.serverTime;
      } catch {
        /* not logged in or no household */
      }
    },
    [t.security.monitoringLive]
  );

  useEffect(() => {
    if (!ready) return;
    load(null);
    const id = setInterval(() => load(sinceRef.current), 8000);
    return () => clearInterval(id);
  }, [ready, load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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

  return (
    <div className="relative" ref={panelRef}>
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

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[var(--card)] p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t.security.monitoringTitle}</div>
              <div className="text-[11px] text-[var(--fg-faint)]">
                {t.security.monitoringInApp}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.close}
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {alerts.length === 0 ? (
              <li className="px-1 py-4 text-center text-sm text-[var(--fg-faint)]">
                {t.security.monitoringEmpty}
              </li>
            ) : (
              alerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={
                        a.severity === "critical"
                          ? "text-red-300"
                          : a.severity === "warning"
                            ? "text-amber-200"
                            : "text-sky-200"
                      }
                    >
                      {a.severity}
                    </span>
                    <span className="text-[var(--fg-faint)]">{a.type}</span>
                    <span className="text-[var(--fg-faint)]">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-0.5 font-medium leading-snug">{a.summary}</div>
                  {a.detail && (
                    <div className="text-[12px] text-[var(--fg-muted)]">{a.detail}</div>
                  )}
                  {a.ip && (
                    <div className="text-[11px] text-[var(--fg-faint)]">IP {a.ip}</div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
