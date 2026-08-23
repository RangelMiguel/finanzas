"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    api<{ meat: { appUrl?: string } }>("/api/integrations/meat")
      .then((res) => setHref(meatHref(res.meat?.appUrl)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      setPos({ top: box.bottom + 8, right: window.innerWidth - box.right });
    };
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
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

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[80] w-[16.5rem] rounded-2xl border border-[var(--line)] bg-[var(--bg-card,#0c101f)] p-3 shadow-2xl"
        style={{ top: pos.top, right: pos.right }}
      >
        <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
          {t.suite.apps}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {apps.map((app) => (
            <a
              key={app.id}
              role="menuitem"
              href={app.href ? "/api/auth/sso/launch" : undefined}
              target="_blank"
              rel="noreferrer"
              className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center no-underline transition hover:bg-white/10 ${
                app.href ? "cursor-pointer" : "cursor-not-allowed opacity-70"
              }`}
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
    ) : null;

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
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
