"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp, type FontScale } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { CURRENCIES, LOCALES } from "@/lib/currencies";
import type { AppLocale } from "@/lib/currencies";
import { DEFAULT_THEME, THEMES, type ThemeId } from "@/lib/themes";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import { MeatLinkCard } from "@/components/meat-link-card";
import { AiSettingsCard } from "@/components/ai-settings-card";

type Cat = {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
};

export default function SettingsPage() {
  const {
    t,
    tr,
    locale,
    setLocale,
    currency,
    setCurrency,
    householdName,
    role,
    refresh,
    a11y,
    setA11y,
    theme,
    setTheme,
  } = useApp();
  const { confirm } = useConfirm();
  const [categories, setCategories] = useState<Cat[]>([]);
  const [name, setName] = useState(householdName || "");
  const [form, setForm] = useState({
    name: "",
    type: "expense",
    icon: "📦",
    color: "#6366f1",
  });
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [wipe, setWipe] = useState({ confirm: "" });
  const canAdmin = role === "owner" || role === "admin";
  const wipeWord = locale === "en" ? "DELETE" : "BORRAR";

  useEffect(() => {
    setName(householdName || "");
  }, [householdName]);

  async function load() {
    const res = await api<{ categories: Cat[] }>("/api/categories");
    setCategories(res.categories);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function saveLocale(next: AppLocale) {
    try {
      await setLocale(next);
      toast.success(t.settings.preferencesSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveCurrency(next: string) {
    try {
      await setCurrency(next);
      toast.success(t.settings.householdSaved);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveHouseholdName() {
    try {
      await api("/api/households", { method: "PATCH", json: { name } });
      toast.success(t.settings.householdSaved);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveCat() {
    try {
      if (editCatId) {
        await api("/api/categories", {
          method: "PATCH",
          json: { id: editCatId, name: form.name, icon: form.icon, color: form.color },
        });
        toast.success(t.settings.categoryUpdated || t.success);
      } else {
        await api("/api/categories", { method: "POST", json: form });
        toast.success(t.settings.categoryCreated);
      }
      setForm({ name: "", type: "expense", icon: "📦", color: "#6366f1" });
      setEditCatId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function openEditCat(c: Cat) {
    setEditCatId(c.id);
    setForm({ name: c.name, type: c.type, icon: c.icon, color: c.color });
  }

  async function removeCat(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.settings.confirmDeleteCat,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/categories?id=${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const expenses = categories.filter((c) => c.type === "expense");
  const incomes = categories.filter((c) => c.type === "income");

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.settings}
        title={t.settings.title}
        subtitle={t.settings.subtitle}
      />

      <PwaSetup variant="card" forceShow />

      <Card premium>
        <CardHeader>
          <CardTitle>{t.settings.appearance}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lang">{t.settings.language}</Label>
            <Select
              id="lang"
              className="mt-1"
              value={locale}
              onChange={(e) => saveLocale(e.target.value as AppLocale)}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[var(--fg-faint)]">
              {t.settings.languageHint}
            </p>
          </div>
          <div>
            <Label htmlFor="cur">{t.settings.currency}</Label>
            <Select
              id="cur"
              className="mt-1"
              value={currency}
              disabled={!canAdmin}
              onChange={(e) => saveCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[var(--fg-faint)]">
              {t.settings.currencyHint}
            </p>
          </div>
          {canAdmin && (
            <div className="flex min-w-[200px] flex-1 flex-wrap items-end gap-2 sm:col-span-2">
              <div className="min-w-[200px] flex-1">
                <Label htmlFor="hh">{t.settings.householdName}</Label>
                <Input
                  id="hh"
                  className="mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button onClick={saveHouseholdName}>{t.save}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card premium>
        <CardHeader>
          <CardTitle>{t.settings.theme}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--fg-muted)]">{t.settings.themeHint}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {THEMES.map((th) => {
              const active = theme === th.id;
              const name = locale === "en" ? th.name.en : th.name.es;
              const desc =
                locale === "en" ? th.description.en : th.description.es;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await setTheme(th.id as ThemeId);
                      toast.success(t.settings.themeSaved);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : t.error);
                    }
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/40"
                      : "border-[var(--line)] bg-black/20 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1" aria-hidden>
                      {th.swatches.map((c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-full border border-white/15"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                    <span className="font-medium text-[var(--fg)]">
                      {name}
                      {th.id === DEFAULT_THEME ? (
                        <span className="ml-1 text-xs text-[var(--fg-faint)]">
                          ({t.settings.themeDefault})
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg-faint)]">{desc}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card premium>
        <CardHeader>
          <CardTitle>{t.a11y.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--fg-muted)]">{t.a11y.subtitle}</p>
          <div>
            <Label htmlFor="font">{t.a11y.fontSize}</Label>
            <Select
              id="font"
              className="mt-1 max-w-xs"
              value={a11y.fontScale}
              onChange={(e) => {
                setA11y({ fontScale: e.target.value as FontScale });
                toast.success(t.a11y.saved);
              }}
            >
              <option value="sm">{t.a11y.fontSm}</option>
              <option value="md">{t.a11y.fontMd}</option>
              <option value="lg">{t.a11y.fontLg}</option>
              <option value="xl">{t.a11y.fontXl}</option>
            </Select>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={a11y.reducedMotion}
              onChange={(e) => {
                setA11y({ reducedMotion: e.target.checked });
                toast.success(t.a11y.saved);
              }}
            />
            <span>
              <span className="font-medium text-[var(--fg)]">
                {t.a11y.reducedMotion}
              </span>
              <span className="block text-xs text-[var(--fg-faint)]">
                {t.a11y.reducedMotionHint}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={a11y.highContrast}
              onChange={(e) => {
                setA11y({ highContrast: e.target.checked });
                toast.success(t.a11y.saved);
              }}
            />
            <span>
              <span className="font-medium text-[var(--fg)]">
                {t.a11y.highContrast}
              </span>
              <span className="block text-xs text-[var(--fg-faint)]">
                {t.a11y.highContrastHint}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={a11y.underlineLinks}
              onChange={(e) => {
                setA11y({ underlineLinks: e.target.checked });
                toast.success(t.a11y.saved);
              }}
            />
            <span>
              <span className="font-medium text-[var(--fg)]">
                {t.a11y.underlineLinks}
              </span>
              <span className="block text-xs text-[var(--fg-faint)]">
                {t.a11y.underlineLinksHint}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <AiSettingsCard />

      <MeatLinkCard />

      <Card premium>
        <CardHeader>
          <CardTitle>{editCatId ? t.edit : t.settings.newCategory}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>{t.name}</Label>
            <Input
              className="mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label>{t.type}</Label>
            <Select
              className="mt-1"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="expense">{t.expense}</option>
              <option value="income">{t.income}</option>
            </Select>
          </div>
          <div>
            <Label>{t.icon}</Label>
            <Input
              className="mt-1"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={saveCat}>{t.create}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {t.settings.expenses} ({expenses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expenses.map((c) => (
              <div key={c.id} className="flex justify-between gap-2 text-sm">
                <span>
                  {c.icon} {c.name}
                </span>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => openEditCat(c)}>
                    {t.edit}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeCat(c.id)}>
                    {t.delete}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.settings.incomes} ({incomes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {incomes.map((c) => (
              <div key={c.id} className="flex justify-between gap-2 text-sm">
                <span>
                  {c.icon} {c.name}
                </span>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => openEditCat(c)}>
                    {t.edit}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeCat(c.id)}>
                    {t.delete}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {canAdmin && (
        <Card className="border-red-500/30" premium>
          <CardHeader>
            <CardTitle className="text-red-300">{t.settings.dangerTitle}</CardTitle>
          </CardHeader>
          <CardContent className="max-w-md space-y-3">
            <p className="text-sm text-[var(--fg-muted)]">
              {tr(t.settings.dangerHint, { word: wipeWord })}
            </p>
            <Input
              placeholder={wipeWord}
              value={wipe.confirm}
              onChange={(e) => setWipe({ ...wipe, confirm: e.target.value })}
              aria-label={wipeWord}
            />
            <Button
              variant="danger"
              onClick={async () => {
                if (wipe.confirm !== wipeWord && wipe.confirm !== "BORRAR") {
                  toast.error(t.error);
                  return;
                }
                try {
                  await api("/api/settings/wipe", {
                    method: "POST",
                    json: { confirm: "BORRAR" },
                  });
                  toast.success(t.settings.wiped);
                  setWipe({ confirm: "" });
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t.error);
                }
              }}
            >
              {t.settings.wipe}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
