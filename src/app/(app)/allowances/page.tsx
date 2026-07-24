"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { centsToInput } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

type Allowance = {
  id: string;
  name: string;
  amountCents: number;
  spentCents: number;
  remainingCents: number;
  period: string;
  enforce: boolean;
  active: boolean;
  status: "ok" | "near" | "over";
  ratio: number;
  user: { id: string; displayName: string };
  category?: { id: string; name: string; icon: string } | null;
  notes?: string | null;
};

type Member = {
  id: string;
  role: string;
  user: { id: string; displayName: string; email: string };
};
type Cat = { id: string; name: string; type: string; icon: string };

export default function AllowancesPage() {
  const { t, money, tr, role } = useApp();
  const [items, setItems] = useState<Allowance[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: "",
    name: "",
    amount: "",
    period: "monthly",
    categoryId: "",
    enforce: true,
    notes: "",
  });

  const canAdmin = role === "owner" || role === "admin";

  async function load() {
    const [a, m, c] = await Promise.all([
      api<{ allowances: Allowance[] }>("/api/allowances"),
      api<{ members: Member[] }>("/api/members"),
      api<{ categories: Cat[] }>("/api/categories"),
    ]);
    setItems(a.allowances);
    setMembers(m.members);
    setCategories(c.categories.filter((x) => x.type === "expense"));
    if (m.members[0] && !form.userId) {
      setForm((f) => ({ ...f, userId: m.members[0].user.id }));
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    try {
      const payload = {
        userId: form.userId,
        name: form.name,
        amount: form.amount,
        period: form.period,
        categoryId: form.categoryId || null,
        enforce: form.enforce,
        notes: form.notes || null,
      };
      if (mode === "edit" && editId) {
        await api("/api/allowances", { method: "PATCH", json: { id: editId, ...payload } });
        toast.success(t.allowances.updated);
      } else {
        await api("/api/allowances", { method: "POST", json: payload });
        toast.success(t.allowances.created);
      }
      setMode("none");
      setEditId(null);
      setForm((f) => ({ ...f, name: "", amount: "", notes: "" }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function openEdit(a: Allowance) {
    setEditId(a.id);
    setForm({
      userId: a.user.id,
      name: a.name,
      amount: centsToInput(a.amountCents),
      period: a.period,
      categoryId: a.category?.id || "",
      enforce: a.enforce,
      notes: a.notes || "",
    });
    setMode("edit");
  }

  async function remove(id: string) {
    if (!confirm(t.allowances.confirmDelete)) return;
    try {
      await api(`/api/allowances?id=${id}`, { method: "DELETE" });
      toast.success(t.allowances.deleted);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function toggleActive(a: Allowance) {
    try {
      await api("/api/allowances", {
        method: "PATCH",
        json: { id: a.id, active: !a.active },
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function statusLabel(s: string) {
    if (s === "over") return t.allowances.overLimit;
    if (s === "near") return t.allowances.nearLimit;
    return t.allowances.ok;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.allowances}
        title={t.allowances.title}
        subtitle={t.allowances.subtitle}
        actions={
          canAdmin ? (
            <Button onClick={() => { setMode("new"); setEditId(null); }}>{t.allowances.new}</Button>
          ) : null
        }
      />

      {mode !== "none" && canAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{mode === "edit" ? t.edit : t.allowances.new}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.allowances.member}</Label>
              <Select
                className="mt-1"
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              >
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.displayName} ({m.role})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                placeholder={t.allowances.namePlaceholder}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.allowances.cap}</Label>
              <Input
                className="mt-1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.period}</Label>
              <Select
                className="mt-1"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              >
                <option value="monthly">{t.allowances.periodMonthly}</option>
                <option value="weekly">{t.allowances.periodWeekly}</option>
              </Select>
            </div>
            <div>
              <Label>{t.category}</Label>
              <Select
                className="mt-1"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">{t.allowances.allCategories}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--fg-muted)] mt-6">
              <input
                type="checkbox"
                checked={form.enforce}
                onChange={(e) => setForm({ ...form, enforce: e.target.checked })}
              />
              {t.allowances.enforce}
            </label>
            <p className="sm:col-span-2 text-xs text-[var(--fg-faint)]">
              {t.allowances.enforceHint}
            </p>
            <div className="flex gap-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => { setMode("none"); setEditId(null); }}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && (
        <p className="text-sm text-[var(--fg-faint)]">{t.allowances.empty}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((a) => {
          const pct = Math.min(a.ratio * 100, 100);
          const bar =
            a.status === "over"
              ? "bg-red-500"
              : a.status === "near"
                ? "bg-amber-500"
                : "bg-emerald-500";
          return (
            <Card key={a.id} className={!a.active ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{a.name}</CardTitle>
                  <p className="text-xs text-[var(--fg-faint)]">
                    {tr(t.allowances.forMember, { name: a.user.displayName })} ·{" "}
                    {a.period === "weekly"
                      ? t.allowances.periodWeekly
                      : t.allowances.periodMonthly}
                    {a.category
                      ? ` · ${a.category.icon} ${a.category.name}`
                      : ` · ${t.allowances.allCategories}`}
                  </p>
                </div>
                {canAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggleActive(a)}
                    >
                      {a.active ? t.active : t.inactive}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                      {t.delete}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--fg-muted)]">{t.allowances.spent}</span>
                  <span>
                    {money(a.spentCents)} / {money(a.amountCents)}
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(a.ratio * 100, 100)}>
                  <div
                    className={`progress-fill ${bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span
                    className={
                      a.status === "over"
                        ? "text-red-400"
                        : a.status === "near"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }
                  >
                    {statusLabel(a.status)}
                    {a.enforce ? ` · ${t.allowances.enforce}` : ""}
                  </span>
                  <span className="text-[var(--fg-muted)]">
                    {t.allowances.remaining}: {money(Math.max(0, a.remainingCents))}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
