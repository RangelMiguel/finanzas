"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { useApp } from "@/components/providers/app-provider";
import { Menu, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SecurityNotifications } from "@/components/security/security-notifications";
import { OfflineBanner } from "@/components/offline/offline-banner";

export function AppShell({
  children,
  householdName,
  userName,
  role,
}: {
  children: React.ReactNode;
  householdName?: string;
  userName?: string;
  role?: string;
}) {
  const { t, tr, impersonating, stopImpersonation, viewRole } = useApp();
  const [open, setOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  async function exitViewAs() {
    setExiting(true);
    try {
      await stopImpersonation();
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="app-frame text-[var(--fg)]">
      <a href="#main-content" className="skip-link">
        {t.skipToContent}
      </a>

      <div className="app-sidebar-dock sticky top-3 hidden md:block">
        <Sidebar
          householdName={householdName}
          userName={userName}
          role={viewRole || role}
        />
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label={t.closeMenu}
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50 m-3 h-[calc(100%-1.5rem)] w-[17.5rem] max-w-[85vw] overflow-hidden rounded-[1.35rem] shadow-2xl">
            <Sidebar
              householdName={householdName}
              userName={userName}
              role={viewRole || role}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div className="sticky top-0 z-40 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-50">
            <span className="flex min-w-0 items-center gap-2">
              <Eye className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {tr(t.security.viewingAs, {
                  name: impersonating.label,
                  role: impersonating.role,
                })}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={exiting}
              onClick={exitViewAs}
            >
              {t.security.exitViewAs}
            </Button>
          </div>
        )}
        <OfflineBanner />
        <header className="app-topbar sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-3 md:top-0 md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={open ? t.closeMenu : t.openMenu}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="font-display truncate text-base md:hidden">
              {t.appName}
            </div>
            <div className="hidden truncate text-sm text-[var(--fg-muted)] md:block">
              <span className="text-[var(--fg-faint)]">{t.appName}</span>
              {householdName ? (
                <>
                  <span className="mx-2 text-[var(--fg-faint)]">/</span>
                  <span className="text-[var(--fg)]">{householdName}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SecurityNotifications />
            <div className="hidden max-w-[10rem] truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--fg-muted)] sm:block">
              {userName}
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="page-stage relative flex-1 overflow-auto p-4 md:px-2 md:py-5"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
