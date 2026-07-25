"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Bell, BellOff, Smartphone, X, Share } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "mf_pwa_setup_dismissed";

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Mac; detect touch
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

export function usePwaSetupNeeded() {
  const pwa = usePwa();
  const needsInstall = !pwa.installed;
  const needsPush =
    pwa.pushSupported &&
    pwa.pushConfigured &&
    !pwa.pushEnabled &&
    typeof Notification !== "undefined" &&
    Notification.permission !== "denied";
  // Even without VAPID, still surface install
  return needsInstall || needsPush || (pwa.pushSupported && !pwa.pushConfigured && !pwa.installed);
}

/** Shared actions for install + push, used by banner, settings, and tray. */
export function usePwaActions() {
  const pwa = usePwa();
  const { t } = useApp();
  const ios = useMemo(() => isIosDevice(), []);

  const onInstall = useCallback(async () => {
    try {
      if (pwa.canInstall) {
        await pwa.install();
        toast.success(t.pwa.installed);
        return;
      }
      // No native prompt — show clear manual steps
      toast.message(ios ? t.pwa.installIos : t.pwa.installManual, {
        duration: 8000,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }, [pwa, t, ios]);

  const onEnablePush = useCallback(async () => {
    try {
      if (!pwa.pushSupported) {
        toast.error(t.pwa.pushUnsupported);
        return;
      }
      if (!pwa.pushConfigured) {
        toast.error(t.pwa.pushNotConfigured);
        return;
      }
      const ok = await pwa.enablePush();
      if (ok) toast.success(t.pwa.pushEnabled);
      else toast.error(t.pwa.pushDenied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }, [pwa, t]);

  const onDisablePush = useCallback(async () => {
    try {
      await pwa.disablePush();
      toast.success(t.pwa.pushDisabled);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }, [pwa, t]);

  return { pwa, ios, onInstall, onEnablePush, onDisablePush };
}

type Variant = "banner" | "card" | "compact";

/**
 * Install app + enable notifications — always available outside the alerts tray.
 * - banner: dismissible card on Home / first sessions
 * - card: full settings block
 * - compact: slim strip for topbar area if needed
 */
export function PwaSetup({
  variant = "banner",
  className,
  forceShow = false,
}: {
  variant?: Variant;
  className?: string;
  /** Ignore localStorage dismiss (e.g. Settings page). */
  forceShow?: boolean;
}) {
  const { t } = useApp();
  const { pwa, ios, onInstall, onEnablePush, onDisablePush } = usePwaActions();
  const [dismissed, setDismissed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const needsInstall = !pwa.installed;
  const canShowPush = pwa.pushSupported;
  const pushReady = pwa.pushConfigured;
  const allDone =
    pwa.installed &&
    (!canShowPush || !pushReady || pwa.pushEnabled);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (!mounted) return null;
  // Home banner only: permanent dismiss via localStorage (never show again there)
  if (variant === "banner" && !forceShow && dismissed) return null;
  if (variant === "banner" && !forceShow && allDone) return null;

  const installBlock = needsInstall && (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        variant === "compact" && "gap-1.5"
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-teal-200">
          <Download className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--fg)]">
            {t.pwa.installTitle}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-faint)]">
            {pwa.canInstall
              ? t.pwa.installHint
              : ios
                ? t.pwa.installIos
                : t.pwa.installManual}
          </p>
          {ios && !pwa.canInstall && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-sky-200/90">
              <Share className="h-3 w-3 shrink-0" aria-hidden />
              {t.pwa.installIosStep}
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        size={variant === "compact" ? "sm" : "default"}
        onClick={onInstall}
        className="shrink-0"
      >
        <Download className="h-4 w-4" />
        {pwa.canInstall ? t.pwa.installCta : t.pwa.howToInstall}
      </Button>
    </div>
  );

  const installedOk = pwa.installed && (
    <div className="flex items-center gap-2 text-xs text-emerald-300/90">
      <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t.pwa.installedLabel}
    </div>
  );

  const pushBlock = canShowPush && (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        needsInstall && "border-t border-white/10 pt-3"
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            pwa.pushEnabled
              ? "bg-emerald-400/15 text-emerald-200"
              : "bg-sky-400/15 text-sky-200"
          )}
        >
          {pwa.pushEnabled ? (
            <Bell className="h-4 w-4" aria-hidden />
          ) : (
            <BellOff className="h-4 w-4" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--fg)]">
            {pwa.pushEnabled ? t.pwa.pushOn : t.pwa.pushTitle}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-faint)]">
            {!pushReady
              ? t.pwa.pushNotConfigured
              : pwa.pushEnabled
                ? t.pwa.pushHintOn
                : t.pwa.pushHint}
          </p>
        </div>
      </div>
      {pushReady && (
        <Button
          type="button"
          size={variant === "compact" ? "sm" : "default"}
          variant={pwa.pushEnabled ? "secondary" : "default"}
          onClick={() =>
            pwa.pushEnabled ? onDisablePush() : onEnablePush()
          }
          className="shrink-0"
        >
          {pwa.pushEnabled ? (
            <>
              <BellOff className="h-4 w-4" />
              {t.pwa.pushDisableCta}
            </>
          ) : (
            <>
              <Bell className="h-4 w-4" />
              {t.pwa.pushEnableCta}
            </>
          )}
        </Button>
      )}
    </div>
  );

  const body = (
    <div className="space-y-3">
      {installBlock}
      {installedOk}
      {pushBlock}
    </div>
  );

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-xl border border-teal-400/25 bg-teal-400/10 p-3",
          className
        )}
      >
        {body}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card premium className={className}>
        <CardHeader>
          <CardTitle className="text-base">{t.pwa.setupTitle}</CardTitle>
          <p className="mt-1 text-xs text-[var(--fg-faint)]">
            {t.pwa.setupSubtitle}
          </p>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  // banner (default) — prominent on first load / home
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-teal-400/30 bg-gradient-to-br from-teal-500/15 via-[#12182b] to-violet-500/10 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]",
        className
      )}
      role="region"
      aria-label={t.pwa.setupTitle}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{t.pwa.setupTitle}</p>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
            {t.pwa.setupSubtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-white/10 hover:text-white"
          aria-label={t.pwa.dismissSetup}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {body}
      <p className="mt-3 text-[10px] text-[var(--fg-faint)]">
        {t.pwa.setupFooter}
      </p>
    </div>
  );
}
