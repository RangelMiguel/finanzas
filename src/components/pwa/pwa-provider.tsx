"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api-client";
import { registerServiceWorker, urlBase64ToUint8Array } from "@/lib/pwa";
import { useApp } from "@/components/providers/app-provider";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  canInstall: boolean;
  installed: boolean;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushConfigured: boolean;
  install: () => Promise<void>;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
};

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { ready } = useApp();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  const pushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    registerServiceWorker().then(() => {
      // After SW is ready, warm app HTML into the page cache (when online)
      if (navigator.onLine) {
        void import("@/lib/offline/warm-routes").then(({ warmOfflineRoutes }) =>
          warmOfflineRoutes()
        );
      }
    });

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Boolean((navigator as any).standalone);
    setInstalled(standalone);

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    function onOnline() {
      void import("@/lib/offline/warm-routes").then(({ warmOfflineRoutes }) =>
        warmOfflineRoutes()
      );
    }
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!ready || !pushSupported) return;
    api<{ configured: boolean; publicKey: string | null }>("/api/push/vapid")
      .then(async (v) => {
        setPushConfigured(v.configured);
        setVapidKey(v.publicKey);
        if (!v.configured || !v.publicKey) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(Boolean(sub) && Notification.permission === "granted");
      })
      .catch(() => {});
  }, [ready, pushSupported]);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setDeferred(null);
      }
      return;
    }
    // iOS / browsers without BIP: user must use Share → Add to Home Screen
  }, [deferred]);

  const enablePush = useCallback(async () => {
    if (!pushSupported || !vapidKey) return false;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const json = sub.toJSON();
    await api("/api/push/subscribe", {
      method: "POST",
      json: {
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
      },
    });
    setPushEnabled(true);
    return true;
  }, [pushSupported, vapidKey]);

  const disablePush = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await api("/api/push/subscribe", {
          method: "DELETE",
          json: { endpoint },
        });
      }
    } catch {
      /* ignore */
    }
    setPushEnabled(false);
  }, []);

  const value = useMemo(
    () => ({
      canInstall: Boolean(deferred) && !installed,
      installed,
      pushSupported,
      pushEnabled,
      pushConfigured,
      install,
      enablePush,
      disablePush,
    }),
    [
      deferred,
      installed,
      pushSupported,
      pushEnabled,
      pushConfigured,
      install,
      enablePush,
      disablePush,
    ]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa outside provider");
  return ctx;
}
