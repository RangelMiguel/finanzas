"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import {
  FULL_VISIBILITY,
  LIMITED_VISIBILITY,
  type MemberVisibility,
} from "@/lib/visibility";
import { Shield, KeyRound, Radio, Trash2 } from "lucide-react";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; displayName: string };
  visibility: MemberVisibility;
  rawVisibility: MemberVisibility;
};

type Catalogs = {
  accounts: { id: string; name: string; icon: string }[];
  categories: { id: string; name: string; icon: string; type: string }[];
  creditCards: { id: string; name: string; lastFour: string }[];
  debts: { id: string; name: string }[];
};

type Passkey = {
  id: string;
  nickname: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

type SecurityAlertRow = {
  id: string;
  type: string;
  severity: string;
  summary: string;
  detail: string | null;
  ip: string | null;
  emailedAt: string | null;
  createdAt: string;
  user: { displayName: string; email: string } | null;
};

const MODULE_KEYS: (keyof MemberVisibility["modules"])[] = [
  "dashboard",
  "accounts",
  "transactions",
  "budgets",
  "creditCards",
  "recurring",
  "debts",
  "goals",
  "allowances",
  "safeToSpend",
  "tickets",
  "statements",
  "importExport",
  "family",
  "settings",
  "activity",
];

export default function SecurityPage() {
  const { t, role, refresh } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [policy, setPolicy] = useState<MemberVisibility>(FULL_VISIBILITY);
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [alerts, setAlerts] = useState<SecurityAlertRow[]>([]);
  const [alertSince, setAlertSince] = useState<string | null>(null);

  const canAdmin = role === "owner" || role === "admin";
  const selected = members.find((m) => m.id === selectedId);
  const isOwnerTarget = selected?.role === "owner";

  async function load() {
    const res = await api<{
      members: Member[];
      catalogs: Catalogs;
    }>("/api/members");
    setMembers(res.members);
    setCatalogs(res.catalogs);
    const first =
      res.members.find((m) => m.role !== "owner") || res.members[0];
    if (first) {
      setSelectedId((prev) => {
        const next = prev || first.id;
        const cur = res.members.find((m) => m.id === next) || first;
        setPolicy(
          cur.role === "owner"
            ? FULL_VISIBILITY
            : cur.rawVisibility || cur.visibility
        );
        return next;
      });
    }
  }

  async function loadPasskeys() {
    const res = await api<{ credentials: Passkey[] }>(
      "/api/auth/webauthn/register"
    );
    setPasskeys(res.credentials);
  }

  async function loadAlerts(since?: string | null) {
    if (!canAdmin) return;
    const q = since ? `?since=${encodeURIComponent(since)}` : "?limit=40";
    const res = await api<{
      alerts: SecurityAlertRow[];
      serverTime: string;
      pollIntervalMs: number;
    }>(`/api/security/alerts${q}`);
    if (since) {
      if (res.alerts.length) {
        setAlerts((prev) => {
          const ids = new Set(prev.map((a) => a.id));
          const fresh = res.alerts.filter((a) => !ids.has(a.id));
          if (fresh.length) {
            toast.message(fresh[0].summary);
          }
          return [...fresh, ...prev].slice(0, 80);
        });
      }
    } else {
      setAlerts(res.alerts);
    }
    setAlertSince(res.serverTime);
  }

  async function registerPasskey() {
    if (!browserSupportsWebAuthn()) {
      toast.error(t.auth.passkeyUnsupported);
      return;
    }
    setPasskeyBusy(true);
    try {
      const options = await api<Record<string, unknown>>(
        "/api/auth/webauthn/register",
        { method: "POST" }
      );
      const response = await startRegistration({ optionsJSON: options as never });
      await api("/api/auth/webauthn/register", {
        method: "PUT",
        json: { response, nickname: passkeyName || undefined },
      });
      setPasskeyName("");
      toast.success(t.security.passkeyAdded);
      await loadPasskeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function deletePasskey(id: string) {
    setPasskeyBusy(true);
    try {
      await api("/api/auth/webauthn/register", {
        method: "DELETE",
        json: { id },
      });
      toast.success(t.security.passkeyRemoved);
      await loadPasskeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setPasskeyBusy(false);
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    loadPasskeys().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alertSinceRef = useRef<string | null>(null);
  useEffect(() => {
    alertSinceRef.current = alertSince;
  }, [alertSince]);

  useEffect(() => {
    if (!canAdmin) return;
    loadAlerts(null).catch(() => {});
    const id = setInterval(() => {
      loadAlerts(alertSinceRef.current).catch(() => {});
    }, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin]);

  useEffect(() => {
    const m = members.find((x) => x.id === selectedId);
    if (!m) return;
    setPolicy(
      m.role === "owner" ? FULL_VISIBILITY : m.rawVisibility || m.visibility
    );
  }, [selectedId, members]);

  function setModule(key: keyof MemberVisibility["modules"], value: boolean) {
    setPolicy((p) => ({
      ...p,
      modules: { ...p.modules, [key]: value },
    }));
  }

  function toggleInList(
    field:
      | "hiddenAccountIds"
      | "allowedAccountIds"
      | "hiddenCategoryIds"
      | "hiddenCreditCardIds"
      | "hiddenDebtIds",
    id: string
  ) {
    setPolicy((p) => {
      const list = new Set(p[field]);
      if (list.has(id)) list.delete(id);
      else list.add(id);
      return { ...p, [field]: Array.from(list) };
    });
  }

  async function save() {
    if (!selectedId || isOwnerTarget) return;
    setLoading(true);
    try {
      await api("/api/members", {
        method: "PATCH",
        json: { membershipId: selectedId, visibility: policy },
      });
      toast.success(t.security.saved);
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(kind: "full" | "limited" | "spend") {
    if (kind === "full") setPolicy({ ...FULL_VISIBILITY });
    else if (kind === "limited") setPolicy({ ...LIMITED_VISIBILITY });
    else {
      setPolicy({
        ...LIMITED_VISIBILITY,
        showIncome: false,
        showExpense: true,
        showTransfers: false,
        onlyOwnTransactions: true,
        showDashboardIncome: false,
        showDashboardExpense: true,
        showDashboardBalance: false,
        modules: {
          ...LIMITED_VISIBILITY.modules,
          accounts: true,
          transactions: true,
          budgets: true,
          safeToSpend: false,
          tickets: true,
        },
      });
    }
  }

  const moduleLabels = useMemo(() => {
    const n = t.nav;
    return {
      dashboard: n.dashboard,
      accounts: n.accounts,
      transactions: n.transactions,
      budgets: n.budgets,
      creditCards: n.creditCards,
      recurring: n.recurring,
      debts: n.debts,
      goals: n.goals,
      allowances: n.personal || n.allowances,
      safeToSpend: n.safeToSpend,
      tickets: n.tickets,
      statements: n.importStatement,
      importExport: n.importExport,
      family: n.family,
      settings: n.settings,
      activity: t.family.activity,
    } as Record<keyof MemberVisibility["modules"], string>;
  }, [t]);

  const passkeysBlock = (
    <>

      <Card premium>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t.security.passkeysTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--fg-muted)]">
            {t.security.passkeysSubtitle}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="pk-name">{t.security.passkeyName}</Label>
              <Input
                id="pk-name"
                className="mt-1"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder={t.security.passkeyNamePlaceholder}
              />
            </div>
            <Button onClick={registerPasskey} disabled={passkeyBusy}>
              <KeyRound className="h-4 w-4" />
              {t.security.addPasskey}
            </Button>
          </div>
          {passkeys.length === 0 ? (
            <p className="text-sm text-[var(--fg-faint)]">{t.security.noPasskeys}</p>
          ) : (
            <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {pk.nickname || pk.deviceType || "Passkey"}
                    </div>
                    <div className="text-[11px] text-[var(--fg-faint)]">
                      {new Date(pk.createdAt).toLocaleString()}
                      {pk.lastUsedAt
                        ? ` · ${new Date(pk.lastUsedAt).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={passkeyBusy}
                    onClick={() => deletePasskey(pk.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.security.removePasskey}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </>
  );

  if (!canAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          kicker={t.nav.security}
          title={t.security.title}
          subtitle={t.security.passkeysSubtitle}
        />
        {passkeysBlock}
        <p className="text-sm text-[var(--fg-muted)]">{t.security.hint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.security}
        title={t.security.title}
        subtitle={t.security.subtitle}
        actions={
          <Button onClick={save} disabled={loading || isOwnerTarget}>
            <Shield className="h-4 w-4" />
            {t.security.savePolicy}
          </Button>
        }
      />
      <p className="text-xs text-[var(--fg-faint)]">{t.security.hint}</p>

      {passkeysBlock}

      <Card premium>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400" />
            {t.security.monitoringTitle}
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
              {t.security.monitoringLive}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--fg-muted)]">
            {t.security.monitoringSubtitle}
          </p>
          <p className="text-[11px] text-[var(--fg-faint)]">
            {t.security.monitoringEmailHint}
          </p>
          {alerts.length === 0 ? (
            <p className="text-sm text-[var(--fg-faint)]">
              {t.security.monitoringEmpty}
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        a.severity === "critical"
                          ? "text-red-300"
                          : a.severity === "warning"
                            ? "text-amber-200"
                            : "text-sky-200"
                      }
                    >
                      {a.severity}
                    </span>
                    <span className="text-[var(--fg-faint)]">{a.type}</span>
                    <span className="text-[11px] text-[var(--fg-faint)]">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                    <span className="text-[11px] text-[var(--fg-faint)]">
                      {a.emailedAt ? t.security.emailed : t.security.notEmailed}
                    </span>
                  </div>
                  <div className="mt-0.5 font-medium">{a.summary}</div>
                  {a.detail && (
                    <div className="text-[12px] text-[var(--fg-muted)]">
                      {a.detail}
                    </div>
                  )}
                  {a.ip && (
                    <div className="text-[11px] text-[var(--fg-faint)]">
                      IP {a.ip}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card premium>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
          <div>
            <Label>{t.security.selectMember}</Label>
            <Select
              className="mt-1"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.displayName} ({m.role})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.security.presets}</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={isOwnerTarget}
                onClick={() => applyPreset("full")}
              >
                {t.security.presetFull}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={isOwnerTarget}
                onClick={() => applyPreset("limited")}
              >
                {t.security.presetLimited}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={isOwnerTarget}
                onClick={() => applyPreset("spend")}
              >
                {t.security.presetSpendOnly}
              </Button>
            </div>
          </div>
          {isOwnerTarget && (
            <p className="sm:col-span-2 text-sm text-amber-200/90">
              {t.security.ownerLocked}
            </p>
          )}
        </CardContent>
      </Card>

      <fieldset disabled={isOwnerTarget} className="space-y-4 disabled:opacity-60">
        <Card premium>
          <CardHeader>
            <CardTitle>{t.security.modules}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MODULE_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={policy.modules[key]}
                  onChange={(e) => setModule(key, e.target.checked)}
                />
                {moduleLabels[key]}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>{t.security.txnTypes}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <Toggle
              label={t.security.showIncome}
              checked={policy.showIncome}
              onChange={(v) => setPolicy((p) => ({ ...p, showIncome: v }))}
            />
            <Toggle
              label={t.security.showExpense}
              checked={policy.showExpense}
              onChange={(v) => setPolicy((p) => ({ ...p, showExpense: v }))}
            />
            <Toggle
              label={t.security.showTransfers}
              checked={policy.showTransfers}
              onChange={(v) => setPolicy((p) => ({ ...p, showTransfers: v }))}
            />
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>{t.security.dashboard}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Toggle
              label={t.security.dashIncome}
              checked={policy.showDashboardIncome}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showDashboardIncome: v }))
              }
            />
            <Toggle
              label={t.security.dashExpense}
              checked={policy.showDashboardExpense}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showDashboardExpense: v }))
              }
            />
            <Toggle
              label={t.security.dashBalance}
              checked={policy.showDashboardBalance}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showDashboardBalance: v }))
              }
            />
            <Toggle
              label={t.security.showBudgets}
              checked={policy.showBudgets}
              onChange={(v) => setPolicy((p) => ({ ...p, showBudgets: v }))}
            />
            <Toggle
              label={t.security.showRecurring}
              checked={policy.showRecurringIncomes}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showRecurringIncomes: v }))
              }
            />
            <Toggle
              label={t.security.showDebtBal}
              checked={policy.showDebtBalances}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showDebtBalances: v }))
              }
            />
            <Toggle
              label={t.security.showExport}
              checked={policy.showExport}
              onChange={(v) => setPolicy((p) => ({ ...p, showExport: v }))}
            />
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>{t.security.scope}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Toggle
              label={t.security.onlyOwn}
              checked={policy.onlyOwnTransactions}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, onlyOwnTransactions: v }))
              }
            />
            <Toggle
              label={t.security.showOthers}
              checked={policy.showOtherMembers}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showOtherMembers: v }))
              }
            />
            <Toggle
              label={t.security.showBalances}
              checked={policy.showAccountBalances}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, showAccountBalances: v }))
              }
            />
          </CardContent>
        </Card>

        {catalogs && (
          <>
            <MultiPick
              title={t.security.hideAccounts}
              items={catalogs.accounts.map((a) => ({
                id: a.id,
                label: `${a.icon} ${a.name}`,
              }))}
              selected={policy.hiddenAccountIds}
              onToggle={(id) => toggleInList("hiddenAccountIds", id)}
            />
            <MultiPick
              title={t.security.onlyAccounts}
              items={catalogs.accounts.map((a) => ({
                id: a.id,
                label: `${a.icon} ${a.name}`,
              }))}
              selected={policy.allowedAccountIds}
              onToggle={(id) => toggleInList("allowedAccountIds", id)}
            />
            <MultiPick
              title={t.security.categories}
              items={catalogs.categories.map((c) => ({
                id: c.id,
                label: `${c.icon} ${c.name} (${c.type})`,
              }))}
              selected={policy.hiddenCategoryIds}
              onToggle={(id) => toggleInList("hiddenCategoryIds", id)}
            />
            <MultiPick
              title={t.security.cards}
              items={catalogs.creditCards.map((c) => ({
                id: c.id,
                label: `${c.name}${c.lastFour ? " •••• " + c.lastFour : ""}`,
              }))}
              selected={policy.hiddenCreditCardIds}
              onToggle={(id) => toggleInList("hiddenCreditCardIds", id)}
            />
            <MultiPick
              title={t.security.debtsHide}
              items={catalogs.debts.map((d) => ({
                id: d.id,
                label: d.name,
              }))}
              selected={policy.hiddenDebtIds}
              onToggle={(id) => toggleInList("hiddenDebtIds", id)}
            />
          </>
        )}
      </fieldset>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function MultiPick({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <Card premium>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
        {items.map((it) => (
          <label
            key={it.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={selected.includes(it.id)}
              onChange={() => onToggle(it.id)}
            />
            <span className="truncate">{it.label}</span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
