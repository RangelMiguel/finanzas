"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { api } from "@/lib/api-client";

export type SuiteApp = {
  id: string;
  label: string;
  hint: string;
  href: string;
};

function meatHref(appUrl?: string | null): string {
  const fromLink = (appUrl || "").trim().replace(/\/+$/, "");
  const fromEnv = (process.env.NEXT_PUBLIC_MEAT_URL || "").trim().replace(/\/+$/, "");
  return fromLink || fromEnv;
}

export function AppLauncher() {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState(meatHref());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ meat: { appUrl?: string } }>("/api/integrations/meat")
      .then((res) => setHref(meatHref(res.meat?.appUrl)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apps: SuiteApp[] = [
    {
      id: "meat",
      label: t.suite.meat,
      hint: href ? t.suite.meatHint : t.suite.needUrl,
      href,
    },
  ];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[var(--fg)] transition hover:bg-white/10 ${
          open ? "bg-white/12" : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.suite.apps}
        onClick={() => setOpen((value) => !value)}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-[16.5rem] rounded-2xl border border-[var(--line)] bg-[var(--bg-card,#0c101f)] p-3 shadow-2xl"
        >
          <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
            {t.suite.apps}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {apps.map((app) => (
              <a
                key={app.id}
                role="menuitem"
                href={app.href || undefined}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center no-underline transition hover:bg-white/8"
                onClick={(event) => {
                  if (!app.href) event.preventDefault();
                  setOpen(false);
                }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-sm font-semibold text-[var(--fg)]">
                  M
                </span>
                <strong className="text-xs font-medium text-[var(--fg)]">{app.label}</strong>
                <em className="text-[10px] not-italic leading-tight text-[var(--fg-faint)]">{app.hint}</em>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
