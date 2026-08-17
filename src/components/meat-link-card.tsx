"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";

type MeatState = {
  enabled: boolean;
  hasToken: boolean;
  tokenPrefix: string | null;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
};

type Opt = { id: string; name: string; type?: string; lastFour?: string };

export function MeatLinkCard() {
  const { t, role } = useApp();
  const { confirm } = useConfirm();
  const canAdmin = role === "owner" || role === "admin";
  const copy = t.settings.meatLink;
  const [meat, setMeat] = useState<MeatState | null>(null);
  const [tokenOnce, setTokenOnce] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Opt[]>([]);
  const [cards, setCards] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);

  async function load() {
    const [linkRes, accRes, catRes] = await Promise.all([
      api<{ meat: MeatState }>("/api/integrations/meat"),
      api<{ accounts: Opt[] }>("/api/accounts").catch(() => ({ accounts: [] })),
      api<{ categories: Opt[] }>("/api/categories"),
    ]);
    setMeat(linkRes.meat);
    setAccounts(accRes.accounts ?? []);
    setCategories((catRes.categories ?? []).filter((c) => c.type === "expense"));
    try {
      const cardRes = await api<{ creditCards: Opt[] }>("/api/credit-cards");
      setCards(cardRes.creditCards ?? []);
    } catch {
      setCards([]);
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e instanceof Error ? e.message : t.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePatch(patch: Partial<MeatState>) {
    if (!canAdmin || !meat) return;
    const previous = meat;
    setMeat({ ...meat, ...patch });
    try {
      const res = await api<{ meat: MeatState }>("/api/integrations/meat", {
        method: "PATCH",
        json: patch,
      });
      if (res.meat) setMeat({ ...previous, ...res.meat });
      toast.success(copy.saved);
    } catch (e) {
      setMeat(previous);
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function generate() {
    if (!canAdmin) return;
    if (meat?.hasToken) {
      const ok = await confirm({
        title: copy.rotate,
        description: copy.confirmRotate,
        confirmLabel: copy.rotate,
        cancelLabel: t.cancel,
        danger: true,
      });
      if (!ok) return;
    }
    const res = await api<{ meat: MeatState; token: string }>("/api/integrations/meat", {
      method: "POST",
    });
    setMeat(res.meat);
    setTokenOnce(res.token);
    toast.success(copy.tokenCreated);
  }

  async function revoke() {
    if (!canAdmin) return;
    const ok = await confirm({
      title: copy.revoke,
      description: copy.confirmRevoke,
      confirmLabel: copy.revoke,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    const res = await api<{ meat: MeatState }>("/api/integrations/meat", {
      method: "DELETE",
    });
    setMeat(res.meat);
    setTokenOnce(null);
    toast.success(copy.tokenRevoked);
  }

  async function copyToken() {
    if (!tokenOnce) return;
    try {
      await navigator.clipboard.writeText(tokenOnce);
      toast.success(copy.tokenCopied);
    } catch {
      toast.error(t.error);
    }
  }

  if (!meat) return null;

  return (
    <Card premium>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--fg-muted)]">{copy.subtitle}</p>
        <p className="text-xs text-[var(--fg-faint)]">{copy.hint}</p>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={meat.enabled && meat.hasToken}
            disabled={!canAdmin || !meat.hasToken}
            onChange={(e) => savePatch({ enabled: e.target.checked })}
          />
          <span className="font-medium text-[var(--fg)]">{copy.enable}</span>
        </label>

        <p className="text-sm text-[var(--fg-muted)]">
          {meat.hasToken
            ? copy.hasToken.replace("{prefix}", meat.tokenPrefix || "")
            : copy.noToken}
        </p>

        {tokenOnce && (
          <div className="rounded-xl border border-[var(--line)] bg-black/20 p-3">
            <p className="text-xs text-[var(--fg-faint)]">{copy.tokenOnce}</p>
            <code className="mt-2 block break-all text-sm text-[var(--fg)]">{tokenOnce}</code>
            <Button className="mt-2" size="sm" variant="secondary" onClick={copyToken}>
              {copy.copyKey}
            </Button>
          </div>
        )}

        {canAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate}>{meat.hasToken ? copy.rotate : copy.generate}</Button>
            {meat.hasToken && (
              <Button variant="ghost" onClick={revoke}>
                {copy.revoke}
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{copy.account}</Label>
            <Select
              className="mt-1"
              disabled={!canAdmin || !meat.hasToken}
              value={meat.accountId ?? ""}
              onChange={(e) =>
                savePatch({
                  accountId: e.target.value || null,
                  creditCardId: e.target.value ? null : meat.creditCardId,
                })
              }
            >
              <option value="">{copy.noneOption}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{copy.card}</Label>
            <Select
              className="mt-1"
              disabled={!canAdmin || !meat.hasToken}
              value={meat.creditCardId ?? ""}
              onChange={(e) =>
                savePatch({
                  creditCardId: e.target.value || null,
                  accountId: e.target.value ? null : meat.accountId,
                })
              }
            >
              <option value="">{copy.noneOption}</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.lastFour ? ` · ${c.lastFour}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{copy.category}</Label>
            <Select
              className="mt-1"
              disabled={!canAdmin || !meat.hasToken}
              value={meat.categoryId ?? ""}
              onChange={(e) => savePatch({ categoryId: e.target.value || null })}
            >
              <option value="">{copy.noneOption}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
