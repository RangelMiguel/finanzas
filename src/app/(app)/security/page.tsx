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
import { useConfirm } from "@/components/providers/confirm-provider";
import { toast } from "sonner";
import {
  FULL_VISIBILITY,
  LIMITED_VISIBILITY,
  isPrivilegedRole,
  type MemberVisibility,
} from "@/lib/visibility";
import { Shield, KeyRound, Radio, Trash2, Eye, BookmarkPlus } from "lucide-react";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { PolicyPreviewModal } from "@/components/security/policy-preview";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; displayName: string };
  visibility: MemberVisibility;
  rawVisibility: MemberVisibility;
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  visibility: MemberVisibility;
  rawVisibility: MemberVisibility;
};

type VisibilityTemplate = {
  id: string;
  name: string;
  visibility: MemberVisibility;
};

type Catalogs = {
  accounts: { id: string; name: string; icon: string }[];
  categories: { id: string; name: string; icon: string; type: string }[];
  creditCards: { id: string; name: string; lastFour: string }[];
  debts: { id: string; name: string }[];
  transactions?: {
    id: string;
    date: string;
    description: string;
    amountCents: number;
    type: string;
    category?: { name: string; icon: string } | null;
  }[];
  budgets?: {
    id: string;
    period: string;
    amountCents: number;
    category: { id: string; name: string; icon: string };
  }[];
};

const INVITE_PREFIX = "invite:";

function isInviteTarget(id: string) {
  return id.startsWith(INVITE_PREFIX);
}

function inviteIdFromTarget(id: string) {
  return id.slice(INVITE_PREFIX.length);
}

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
  "retirement",
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
  const { t, tr, role, refresh, money } = useApp();
  const { confirm } = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [policy, setPolicy] = useState<MemberVisibility>(FULL_VISIBILITY);
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [alerts, setAlerts] = useState<SecurityAlertRow[]>([]);
  const [alertSince, setAlertSince] = useState<string | null>(null);
  const [templates, setTemplates] = useState<VisibilityTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState("");

  const canAdmin = role === "owner" || role === "admin";
  const selectedInvite = isInviteTarget(selectedId)
    ? invites.find((i) => i.id === inviteIdFromTarget(selectedId))
    : undefined;
  const selected = members.find((m) => m.id === selectedId);
  const isOwnerTarget = selected?.role === "owner";
  const isInviteSelected = !!selectedInvite;
  const previewRole =
    selectedInvite?.role || selected?.role || "member";

  async function load() {
    const [res, inv] = await Promise.all([
      api<{
        members: Member[];
        catalogs: Catalogs;
      }>("/api/members"),
      canAdmin
        ? api<{ invites: PendingInvite[] }>("/api/invites").catch(() => ({
            invites: [] as PendingInvite[],
          }))
        : Promise.resolve({ invites: [] as PendingInvite[] }),
    ]);
    setMembers(res.members);
    setInvites(inv.invites || []);
    setCatalogs(res.catalogs);

    if (canAdmin) {
      try {
        const tpl = await api<{ templates: VisibilityTemplate[] }>(
          "/api/security/templates"
        );
        setTemplates(tpl.templates || []);
      } catch {
        setTemplates([]);
      }
    }

    setSelectedId((prev) => {
      // Keep current selection if still valid
      if (prev && isInviteTarget(prev)) {
        const id = inviteIdFromTarget(prev);
        if (inv.invites.some((i) => i.id === id)) return prev;
      }
      if (prev && res.members.some((m) => m.id === prev)) return prev;

      // Prefer first pending invite, then first non-owner member
      if (inv.invites[0]) return INVITE_PREFIX + inv.invites[0].id;
      const first =
        res.members.find((m) => m.role !== "owner") || res.members[0];
      return first?.id || "";
    });
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
    // re-run when role/admin status is known so pending invites load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin]);

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
    if (isInviteTarget(selectedId)) {
      const inv = invites.find((i) => i.id === inviteIdFromTarget(selectedId));
      if (inv) {
        setPolicy(inv.rawVisibility || inv.visibility || { ...LIMITED_VISIBILITY });
      }
      return;
    }
    const m = members.find((x) => x.id === selectedId);
    if (!m) return;
    setPolicy(
      m.role === "owner" ? FULL_VISIBILITY : m.rawVisibility || m.visibility
    );
  }, [selectedId, members, invites]);

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
      | "hiddenDebtIds"
      | "hiddenTransactionIds"
      | "hiddenBudgetIds",
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
      if (isInviteTarget(selectedId)) {
        await api("/api/invites", {
          method: "PATCH",
          json: {
            inviteId: inviteIdFromTarget(selectedId),
            visibility: policy,
          },
        });
        toast.success(t.security.savedInvite || t.security.saved);
      } else {
        await api("/api/members", {
          method: "PATCH",
          json: { membershipId: selectedId, visibility: policy },
        });
        toast.success(t.security.saved);
      }
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  async function revokeSelectedInvite() {
    if (!selectedInvite) return;
    const ok = await confirm({
      title: t.security.revokeInvite || t.family.revokeInvite,
      description: tr(t.family.confirmRevokeInvite, {
        email: selectedInvite.email,
      }),
      confirmLabel: t.security.revokeInvite || t.family.revokeInvite,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/invites?id=${encodeURIComponent(selectedInvite.id)}`, {
        method: "DELETE",
      });
      toast.success(t.family.inviteRevoked);
      setSelectedId("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
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

  function applyTemplate(tpl: VisibilityTemplate) {
    setPolicy({
      ...tpl.visibility,
      modules: { ...tpl.visibility.modules },
      hiddenAccountIds: [...tpl.visibility.hiddenAccountIds],
      allowedAccountIds: [...tpl.visibility.allowedAccountIds],
      hiddenCategoryIds: [...tpl.visibility.hiddenCategoryIds],
      allowedCategoryIds: [...(tpl.visibility.allowedCategoryIds || [])],
      hiddenCreditCardIds: [...tpl.visibility.hiddenCreditCardIds],
      hiddenDebtIds: [...tpl.visibility.hiddenDebtIds],
      hiddenTransactionIds: [...(tpl.visibility.hiddenTransactionIds || [])],
      hiddenBudgetIds: [...(tpl.visibility.hiddenBudgetIds || [])],
    });
    toast.success(t.security.templateApplied);
  }

  async function saveAsTemplate() {
    const name = templateName.trim();
    if (!name) {
      toast.error(t.security.templateName);
      return;
    }
    try {
      await api("/api/security/templates", {
        method: "POST",
        json: { name, visibility: policy },
      });
      setTemplateName("");
      toast.success(t.security.templateSaved);
      const tpl = await api<{ templates: VisibilityTemplate[] }>(
        "/api/security/templates"
      );
      setTemplates(tpl.templates || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function updateTemplate(id: string) {
    try {
      await api("/api/security/templates", {
        method: "PATCH",
        json: { id, visibility: policy },
      });
      toast.success(t.security.templateUpdated);
      const tpl = await api<{ templates: VisibilityTemplate[] }>(
        "/api/security/templates"
      );
      setTemplates(tpl.templates || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function deleteTemplate(tpl: VisibilityTemplate) {
    const ok = await confirm({
      title: t.delete,
      description: tr(t.security.confirmDeleteTemplate, { name: tpl.name }),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/security/templates?id=${encodeURIComponent(tpl.id)}`, {
        method: "DELETE",
      });
      toast.success(t.security.templateDeleted);
      setTemplates((list) => list.filter((x) => x.id !== tpl.id));
      if (bulkTemplateId === tpl.id) setBulkTemplateId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function toggleBulk(id: string) {
    setBulkIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function applyTemplateToMany() {
    if (!bulkTemplateId) return;
    const tpl = templates.find((x) => x.id === bulkTemplateId);
    if (!tpl) return;
    if (bulkIds.length === 0) {
      toast.error(t.security.noneSelected);
      return;
    }
    setLoading(true);
    try {
      let n = 0;
      for (const id of bulkIds) {
        if (isInviteTarget(id)) {
          await api("/api/invites", {
            method: "PATCH",
            json: {
              inviteId: inviteIdFromTarget(id),
              visibility: tpl.visibility,
            },
          });
          n++;
        } else {
          const mem = members.find((m) => m.id === id);
          if (!mem || mem.role === "owner") continue;
          await api("/api/members", {
            method: "PATCH",
            json: { membershipId: id, visibility: tpl.visibility },
          });
          n++;
        }
      }
      toast.success(tr(t.security.applyToManyDone, { n }));
      setBulkIds([]);
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
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
      retirement: n.retirement,
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
              disabled={isOwnerTarget}
            >
              <Eye className="h-4 w-4" />
              {t.security.preview}
            </Button>
            {isInviteSelected && (
              <Button
                variant="secondary"
                onClick={revokeSelectedInvite}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4" />
                {t.security.revokeInvite || t.family.revokeInvite}
              </Button>
            )}
            <Button onClick={save} disabled={loading || isOwnerTarget}>
              <Shield className="h-4 w-4" />
              {t.security.savePolicy}
            </Button>
          </div>
        }
      />
      <p className="text-xs text-[var(--fg-faint)]">{t.security.hint}</p>

      <PolicyPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        policy={policy}
        role={previewRole}
        catalogs={catalogs}
        moduleLabels={moduleLabels}
        isPrivilegedRole={isPrivilegedRole(previewRole)}
        labels={{
          title: t.security.previewTitle,
          subtitle: tr(t.security.previewSubtitle, { role: previewRole }),
          adminNote: t.security.previewAdminNote,
          modules: t.security.previewModules,
          modulesNone: t.security.previewModulesNone,
          txn: t.security.previewTxn,
          accounts: t.security.previewAccounts,
          cards: t.security.previewCards,
          debts: t.security.previewDebts,
          flags: t.security.previewFlags,
          balancesOn: t.security.previewBalancesOn,
          balancesOff: t.security.previewBalancesOff,
          onlyOwn: t.security.previewOnlyOwn,
          allTxn: t.security.previewAllTxn,
          namesOn: t.security.previewNamesOn,
          namesOff: t.security.previewNamesOff,
          showIncome: t.security.showIncome,
          showExpense: t.security.showExpense,
          showTransfers: t.security.showTransfers,
          dashIncome: t.security.dashIncome,
          dashExpense: t.security.dashExpense,
          dashBalance: t.security.dashBalance,
          close: t.security.closePreview,
          visible: t.security.previewVisible,
          hidden: t.security.previewHidden,
        }}
      />

      {passkeysBlock}

      <Card premium>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-4 w-4" />
            {t.security.templates}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--fg-muted)]">
            {t.security.templatesHint}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="tpl-name">{t.security.templateName}</Label>
              <Input
                id="tpl-name"
                className="mt-1"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t.security.templateNamePh}
              />
            </div>
            <Button
              onClick={saveAsTemplate}
              disabled={isOwnerTarget}
              variant="secondary"
            >
              {t.security.saveAsTemplate}
            </Button>
          </div>

          {templates.length === 0 ? (
            <p className="text-sm text-[var(--fg-faint)]">
              {t.security.noTemplates}
            </p>
          ) : (
            <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-[var(--fg)]">{tpl.name}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isOwnerTarget}
                      onClick={() => applyTemplate(tpl)}
                    >
                      {t.security.applyTemplate}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isOwnerTarget}
                      onClick={() => updateTemplate(tpl.id)}
                    >
                      {t.security.updateTemplate}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTemplate(tpl)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {templates.length > 0 && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-[var(--fg-faint)]">
                {t.security.applyToManyHint}
              </p>
              <div>
                <Label>{t.security.templates}</Label>
                <Select
                  className="mt-1"
                  value={bulkTemplateId}
                  onChange={(e) => setBulkTemplateId(e.target.value)}
                >
                  <option value="">{t.select}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t.security.selectTargets}</Label>
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {invites.map((inv) => {
                    const id = INVITE_PREFIX + inv.id;
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={bulkIds.includes(id)}
                          onChange={() => toggleBulk(id)}
                        />
                        <span>
                          {inv.email}{" "}
                          <span className="text-[var(--fg-faint)]">
                            ({t.security.pendingBadge})
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {members
                    .filter((m) => m.role !== "owner")
                    .map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={bulkIds.includes(m.id)}
                          onChange={() => toggleBulk(m.id)}
                        />
                        <span>
                          {m.user.displayName} ({m.role})
                        </span>
                      </label>
                    ))}
                </div>
              </div>
              <Button
                size="sm"
                disabled={!bulkTemplateId || loading}
                onClick={applyTemplateToMany}
              >
                {t.security.applyToMany}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
            <Label>{t.security.selectTarget || t.security.selectMember}</Label>
            <Select
              className="mt-1"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {invites.length > 0 && (
                <optgroup label={t.security.pendingInvites}>
                  {invites.map((inv) => (
                    <option key={inv.id} value={INVITE_PREFIX + inv.id}>
                      {tr(t.security.inviteTarget, {
                        email: inv.email,
                        role: inv.role,
                      })}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t.security.selectMember}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.displayName} ({m.role})
                  </option>
                ))}
              </optgroup>
            </Select>
            {isInviteSelected && (
              <p className="mt-1 text-xs text-amber-200/90">
                <span className="mr-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                  {t.security.pendingBadge}
                </span>
                {t.security.pendingHint}
              </p>
            )}
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
            <MultiPick
              title={t.security.hideTransactions}
              hint={t.security.hideTransactionsHint}
              items={(catalogs.transactions || []).map((tx) => ({
                id: tx.id,
                label: `${tx.date} · ${tx.category?.icon || "•"} ${tx.description} · ${money(tx.amountCents)} (${tx.type})`,
              }))}
              selected={policy.hiddenTransactionIds || []}
              onToggle={(id) => toggleInList("hiddenTransactionIds", id)}
            />
            <MultiPick
              title={t.security.hideBudgets}
              hint={t.security.hideBudgetsHint}
              items={(catalogs.budgets || []).map((b) => ({
                id: b.id,
                label: `${b.category.icon} ${b.category.name} · ${b.period} · ${money(b.amountCents)}`,
              }))}
              selected={policy.hiddenBudgetIds || []}
              onToggle={(id) => toggleInList("hiddenBudgetIds", id)}
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
  hint,
  items,
  selected,
  onToggle,
}: {
  title: string;
  hint?: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <Card premium>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint ? (
          <p className="mt-1 text-xs text-[var(--fg-faint)]">{hint}</p>
        ) : null}
      </CardHeader>
      <CardContent className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-1 lg:grid-cols-2">
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
