"use client";

import { useEffect, useState } from "react";
import { Store, Check, Download, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import { ADDON_MODULES, type AppModuleId } from "@/lib/modules/catalog";

export default function MarketplacePage() {
  const { t, refresh, role } = useApp();
  const [installed, setInstalled] = useState<string[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const isAdmin = role === "owner" || role === "admin";

  async function load() {
    const data = await api<{
      installed: string[];
      canManage: boolean;
    }>("/api/modules");
    setInstalled(data.installed);
    setCanManage(data.canManage);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function install(moduleId: string) {
    setBusy(moduleId);
    try {
      const res = await api<{ installed: string[] }>("/api/modules", {
        method: "POST",
        json: { moduleId },
      });
      setInstalled(res.installed);
      await refresh();
      toast.success(t.marketplace.installed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(moduleId: string) {
    setBusy(moduleId);
    try {
      const res = await api<{ installed: string[] }>(
        `/api/modules?moduleId=${encodeURIComponent(moduleId)}`,
        { method: "DELETE" }
      );
      setInstalled(res.installed);
      await refresh();
      toast.success(t.marketplace.removed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(null);
    }
  }

  const copy = t.marketplace.modules;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.marketplace}
        title={t.marketplace.title}
        subtitle={t.marketplace.subtitle}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {ADDON_MODULES.map((mod) => {
          const on = installed.includes(mod.id);
          const meta = copy[mod.id as keyof typeof copy];
          return (
            <Card key={mod.id} premium>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  {meta?.title || mod.id}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[var(--fg-muted)]">
                  {meta?.description}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--fg-faint)]">
                    {mod.priceCents === 0
                      ? t.marketplace.free
                      : t.marketplace.priceSoon}
                  </span>
                  {on ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        {t.marketplace.statusOn}
                      </span>
                      {canManage && isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === mod.id}
                          onClick={() => uninstall(mod.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t.marketplace.remove}
                        </Button>
                      )}
                    </div>
                  ) : (
                    canManage &&
                    isAdmin && (
                      <Button
                        size="sm"
                        disabled={busy === mod.id}
                        onClick={() => install(mod.id as AppModuleId)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t.marketplace.install}
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
