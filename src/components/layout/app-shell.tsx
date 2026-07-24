"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { useApp } from "@/components/providers/app-provider";
import { Menu, X } from "lucide-react";
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
  const { t } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen text-[var(--fg)]">
      <a href="#main-content" className="skip-link">
        {t.skipToContent}
      </a>

      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar
          householdName={householdName}
          userName={userName}
          role={role}
        />
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label={t.closeMenu}
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50 h-full w-[17rem] max-w-[85vw] shadow-2xl">
            <Sidebar
              householdName={householdName}
              userName={userName}
              role={role}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="app-topbar sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 md:px-8">
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
              {householdName || t.appName}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SecurityNotifications />
            <div className="hidden max-w-[10rem] truncate text-xs text-[var(--fg-muted)] sm:block">
              {userName}
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="relative flex-1 overflow-auto p-4 md:p-8"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
