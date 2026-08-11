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
  SPEND_ONLY_VISIBILITY,
  accessLevelOf,
  type MemberVisibility,
} from "@/lib/visibility";
import {
  Shield,
  KeyRound,
  Radio,
  Trash2,
  Eye,
  BookmarkPlus,
  RefreshCw,
  Copy,
} from "lucide-react";
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
  "properties",
  "prices",
  "investments",
];

export default function SecurityPage() {
  const { t, tr, role, refresh } = useApp();
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
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [copyFromMemberId, setCopyFromMemberId] = useState("");
  const [templateFromMemberId, setTemplateFromMemberId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showPasskeys, setShowPasskeys] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const canAdmin = role === "owner" || role === "admin";
  const selectedInvite = isInviteTarget(selectedId)
    ? invites.find((i) => i.id === inviteIdFromTarget(selectedId))
    : undefined;
  const selected = members.find((m) => m.id === selectedId);
  const isOwnerTarget = selected?.role === "owner";
  const isInviteSelected = !!selectedInvite;
  const previewRole =
    selectedInvite?.role || selected?.role || "member";
  const accessLevel = accessLevelOf(policy);

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


  async function startViewAs() {
    if (!selectedId || isOwnerTarget) return;
    try {
      const body = isInviteTarget(selectedId)
        ? { inviteId: inviteIdFromTarget(selectedId) }
        : { membershipId: selectedId };
      await api("/api/security/impersonate", { method: "POST", json: body });
      toast.success(t.security.viewAsStarted);
      await refresh();
      // Navigate home so the member experience is obvious
      window.location.href = "/";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
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
    // Keep category hide lists when switching level. For limited/spend, drop
    // account/card allow-lists — those were meant to hide money, not erase
    // expenses from movements/budgets (balances already off via flags).
    const keepCategories = {
      hiddenCategoryIds: policy.hiddenCategoryIds,
      hiddenTransactionIds: policy.hiddenTransactionIds || [],
      hiddenBudgetIds: policy.hiddenBudgetIds || [],
    };
    const keepAccounts =
      kind === "full"
        ? {
            hiddenAccountIds: policy.hiddenAccountIds,
            allowedAccountIds: policy.allowedAccountIds,
            hiddenCreditCardIds: policy.hiddenCreditCardIds,
            hiddenDebtIds: policy.hiddenDebtIds,
          }
        : {
            hiddenAccountIds: [] as string[],
            allowedAccountIds: [] as string[],
            hiddenCreditCardIds: [] as string[],
            hiddenDebtIds: [] as string[],
          };
    const base =
      kind === "full"
        ? FULL_VISIBILITY
        : kind === "limited"
          ? LIMITED_VISIBILITY
          : SPEND_ONLY_VISIBILITY;
    setPolicy({
      ...base,
      modules: { ...base.modules },
      ...keepCategories,
      ...keepAccounts,
      // Always keep spend visible on these levels (balances stay off)
      showExpense: kind === "full" ? base.showExpense : true,
      showDashboardExpense: kind === "full" ? base.showDashboardExpense : true,
    });
  }

  function cloneVisibility(v: MemberVisibility): MemberVisibility {
    return {
      ...v,
      modules: { ...v.modules },
      hiddenAccountIds: [...v.hiddenAccountIds],
      allowedAccountIds: [...v.allowedAccountIds],
      hiddenCategoryIds: [...v.hiddenCategoryIds],
      allowedCategoryIds: [...(v.allowedCategoryIds || [])],
      hiddenCreditCardIds: [...v.hiddenCreditCardIds],
      hiddenDebtIds: [...v.hiddenDebtIds],
      hiddenTransactionIds: [...(v.hiddenTransactionIds || [])],
      hiddenBudgetIds: [...(v.hiddenBudgetIds || [])],
    };
  }

  function applyTemplate(tpl: VisibilityTemplate) {
    setPolicy(cloneVisibility(tpl.visibility));
    toast.success(t.security.templateApplied);
  }

  /** Load another member's (or invite's) policy into the editor without saving. */
  function copyPolicyFromTarget(targetId: string) {
    if (!targetId) return;
    if (isInviteTarget(targetId)) {
      const inv = invites.find((i) => i.id === inviteIdFromTarget(targetId));
      if (!inv) return;
      setPolicy(
        cloneVisibility(inv.rawVisibility || inv.visibility || LIMITED_VISIBILITY)
      );
      toast.success(
        tr(t.security.policyCopiedFrom, { name: inv.email })
      );
      return;
    }
    const m = members.find((x) => x.id === targetId);
    if (!m) return;
    const vis =
      m.role === "owner"
        ? FULL_VISIBILITY
        : m.rawVisibility || m.visibility;
    setPolicy(cloneVisibility(vis));
    toast.success(
      tr(t.security.policyCopiedFrom, { name: m.user.displayName })
    );
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

  /** Create a named template by copying a member's stored visibility (not the editor). */
  async function saveTemplateFromMember() {
    const name = templateName.trim();
    if (!name) {
      toast.error(t.security.templateName);
      return;
    }
    if (!templateFromMemberId) {
      toast.error(t.security.saveFromMemberPh);
      return;
    }
    const source = members.find((m) => m.id === templateFromMemberId);
    try {
      await api("/api/security/templates", {
        method: "POST",
        json: { name, membershipId: templateFromMemberId },
      });
      setTemplateName("");
      setTemplateFromMemberId("");
      toast.success(
        tr(t.security.templateFromMemberSaved, {
          name: source?.user.displayName || name,
        })
      );
      const tpl = await api<{ templates: VisibilityTemplate[] }>(
        "/api/security/templates"
      );
      setTemplates(tpl.templates || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function resendSelectedInvite() {
    if (!selectedInvite) return;
    try {
      const res = await api<{ inviteUrl: string }>("/api/invites", {
        method: "POST",
        json: { resendInviteId: selectedInvite.id },
      });
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.inviteUrl}`
          : res.inviteUrl;
      setLastInviteUrl(url);
      toast.success(t.security.inviteResent);
      await load();
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t.family.copied);
      } catch {
        /* clipboard may be blocked */
      }
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
      properties: n.properties,
      prices: n.prices,
      investments: n.investments,
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
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        kicker={t.nav.security}
        title={t.security.titleSimple}
        subtitle={t.security.subtitleSimple}
      />

      {/* Step 1: who */}
      <Card premium>
        <CardHeader>
          <CardTitle className="text-base">
            1. {t.security.stepWho}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Select
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
            <p className="text-xs text-amber-200/90">
              <span className="mr-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
                {t.security.pendingBadge}
              </span>
              {t.security.pendingHint}
            </p>
          )}
          {isOwnerTarget && (
            <p className="text-sm text-amber-200/90">{t.security.ownerLocked}</p>
          )}

          {/* Copy policy from another member/invite into the editor */}
          {!isOwnerTarget && selectedId && (
            <div className="space-y-1.5 border-t border-white/10 pt-3">
              <Label htmlFor="copy-from">{t.security.copyFromMember}</Label>
              <p className="text-xs text-[var(--fg-faint)]">
                {t.security.copyFromMemberHint}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  id="copy-from"
                  className="flex-1"
                  value={copyFromMemberId}
                  onChange={(e) => setCopyFromMemberId(e.target.value)}
                >
                  <option value="">{t.security.copyFromMemberPh}</option>
                  {invites
                    .filter(
                      (inv) => INVITE_PREFIX + inv.id !== selectedId
                    )
                    .map((inv) => (
                      <option
                        key={inv.id}
                        value={INVITE_PREFIX + inv.id}
                      >
                        {inv.email} ({t.security.pendingBadge})
                      </option>
                    ))}
                  {members
                    .filter((m) => m.id !== selectedId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.user.displayName} ({m.role})
                      </option>
                    ))}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!copyFromMemberId}
                  onClick={() => {
                    copyPolicyFromTarget(copyFromMemberId);
                    setCopyFromMemberId("");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t.security.copyFromMember}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <fieldset disabled={isOwnerTarget || !selectedId} className="space-y-5 disabled:opacity-50">
        {/* Step 2: access level */}
        <Card premium>
          <CardHeader>
            <CardTitle className="text-base">
              2. {t.security.stepLevel}
            </CardTitle>
            <p className="mt-1 text-xs text-[var(--fg-faint)]">
              {t.security.stepLevelHint}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {(
              [
                {
                  id: "full" as const,
                  title: t.security.levelFull,
                  desc: t.security.levelFullDesc,
                },
                {
                  id: "limited" as const,
                  title: t.security.levelLimited,
                  desc: t.security.levelLimitedDesc,
                },
                {
                  id: "spend" as const,
                  title: t.security.levelSpend,
                  desc: t.security.levelSpendDesc,
                },
              ] as const
            ).map((lvl) => {
              const active = accessLevel === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => applyPreset(lvl.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/40"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <div className="font-medium text-[var(--fg)]">{lvl.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--fg-faint)]">
                    {lvl.desc}
                  </p>
                </button>
              );
            })}
          </CardContent>
          {accessLevel === "custom" && (
            <p className="px-5 pb-4 text-xs text-amber-200/80">
              {t.security.levelCustomHint}
            </p>
          )}
        </Card>

        {/* Step 3: hide categories */}
        {catalogs && catalogs.categories.length > 0 && (
          <Card premium>
            <CardHeader>
              <CardTitle className="text-base">
                3. {t.security.stepCategories}
              </CardTitle>
              <p className="mt-1 text-xs text-[var(--fg-faint)]">
                {t.security.categoriesHideHint}
              </p>
            </CardHeader>
            <CardContent className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
              {catalogs.categories.map((c) => {
                const on = policy.hiddenCategoryIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      on
                        ? "border-rose-400/30 bg-rose-500/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleInList("hiddenCategoryIds", c.id)}
                    />
                    <span className="truncate">
                      {c.icon} {c.name}
                    </span>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={loading || isOwnerTarget || !selectedId}>
            <Shield className="h-4 w-4" />
            {t.security.savePolicy}
          </Button>
          <Button
            variant="secondary"
            onClick={startViewAs}
            disabled={loading || isOwnerTarget || !selectedId}
          >
            <Eye className="h-4 w-4" />
            {isInviteSelected ? t.security.viewAsInvite : t.security.viewAs}
          </Button>
          {isInviteSelected && (
            <Button
              variant="secondary"
              onClick={resendSelectedInvite}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              {t.security.resendInvite}
            </Button>
          )}
          {isInviteSelected && (
            <Button
              variant="ghost"
              onClick={revokeSelectedInvite}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4" />
              {t.security.revokeInvite || t.family.revokeInvite}
            </Button>
          )}
        </div>
        <p className="text-xs text-[var(--fg-faint)]">{t.security.viewAsHint}</p>
        {isInviteSelected && lastInviteUrl && (
          <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 p-3">
            <p className="text-xs font-medium text-[var(--fg-muted)]">
              {t.family.shareInvite}
            </p>
            <p className="mt-1 break-all text-xs text-[var(--fg-faint)]">
              {lastInviteUrl}
            </p>
          </div>
        )}

        {/* Advanced (collapsed) */}
        <Card premium>
          <CardHeader>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <CardTitle className="text-base">
                {t.security.advanced}
              </CardTitle>
              <span className="text-xs text-[var(--fg-faint)]">
                {showAdvanced ? t.security.hideAdvanced : t.security.showAdvanced}
              </span>
            </button>
            <p className="mt-1 text-xs text-[var(--fg-faint)]">
              {t.security.advancedHint}
            </p>
          </CardHeader>
          {showAdvanced && (
            <CardContent className="space-y-4 border-t border-white/10 pt-4">
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--fg)]">
                  {t.security.modules}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {MODULE_KEYS.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={policy.modules[key]}
                        onChange={(e) => setModule(key, e.target.checked)}
                      />
                      {moduleLabels[key]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
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
                  onChange={(v) =>
                    setPolicy((p) => ({ ...p, showTransfers: v }))
                  }
                />
                <Toggle
                  label={t.security.showBalances}
                  checked={policy.showAccountBalances}
                  onChange={(v) =>
                    setPolicy((p) => ({ ...p, showAccountBalances: v }))
                  }
                />
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
                  label={t.security.showExport}
                  checked={policy.showExport}
                  onChange={(v) => setPolicy((p) => ({ ...p, showExport: v }))}
                />
              </div>

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
            </CardContent>
          )}
        </Card>

        {/* Templates simplified */}
        <Card premium>
          <CardHeader>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowTemplates((v) => !v)}
            >
              <CardTitle className="flex items-center gap-2 text-base">
                <BookmarkPlus className="h-4 w-4" />
                {t.security.templates}
              </CardTitle>
              <span className="text-xs text-[var(--fg-faint)]">
                {showTemplates ? "−" : "+"}
              </span>
            </button>
          </CardHeader>
          {showTemplates && (
            <CardContent className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-xs text-[var(--fg-faint)]">
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
                  variant="secondary"
                  onClick={saveAsTemplate}
                  disabled={isOwnerTarget}
                >
                  {t.security.saveAsTemplate}
                </Button>
              </div>

              {/* Create template from an existing member's policy */}
              <div className="space-y-2 rounded-xl border border-white/10 p-3">
                <p className="text-sm font-medium text-[var(--fg)]">
                  {t.security.saveFromMember}
                </p>
                <p className="text-xs text-[var(--fg-faint)]">
                  {t.security.saveFromMemberHint}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Select
                      value={templateFromMemberId}
                      onChange={(e) =>
                        setTemplateFromMemberId(e.target.value)
                      }
                    >
                      <option value="">{t.security.saveFromMemberPh}</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.user.displayName} ({m.role})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={saveTemplateFromMember}
                    disabled={!templateFromMemberId || !templateName.trim()}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    {t.security.saveFromMember}
                  </Button>
                </div>
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
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{tpl.name}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => applyTemplate(tpl)}
                        >
                          {t.security.applyTemplate}
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
                <div className="space-y-2 rounded-xl border border-white/10 p-3">
                  <p className="text-xs text-[var(--fg-faint)]">
                    {t.security.applyToManyHint}
                  </p>
                  <Select
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
                  <div className="max-h-32 space-y-1 overflow-y-auto text-sm">
                    {invites.map((inv) => {
                      const id = INVITE_PREFIX + inv.id;
                      return (
                        <label key={id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={bulkIds.includes(id)}
                            onChange={() => toggleBulk(id)}
                          />
                          {inv.email}
                        </label>
                      );
                    })}
                    {members
                      .filter((m) => m.role !== "owner")
                      .map((m) => (
                        <label key={m.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={bulkIds.includes(m.id)}
                            onChange={() => toggleBulk(m.id)}
                          />
                          {m.user.displayName}
                        </label>
                      ))}
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
          )}
        </Card>
      </fieldset>

      {/* Passkeys collapsed */}
      <div>
        <button
          type="button"
          className="mb-2 text-sm text-[var(--fg-muted)] underline-offset-2 hover:underline"
          onClick={() => setShowPasskeys((v) => !v)}
        >
          {showPasskeys ? "− " : "+ "}
          {t.security.passkeysTitle}
        </button>
        {showPasskeys && passkeysBlock}
      </div>

      {/* Alerts collapsed */}
      <Card premium>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowAlerts((v) => !v)}
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-emerald-400" />
              {t.security.monitoringTitle}
            </CardTitle>
            <span className="text-xs text-[var(--fg-faint)]">
              {showAlerts ? "−" : `${alerts.length}`}
            </span>
          </button>
        </CardHeader>
        {showAlerts && (
          <CardContent className="max-h-72 space-y-2 overflow-y-auto border-t border-white/10 pt-4">
            {alerts.length === 0 ? (
              <p className="text-sm text-[var(--fg-faint)]">
                {t.security.monitoringEmpty}
              </p>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
                >
                  <div className="text-[11px] text-[var(--fg-faint)]">
                    {new Date(a.createdAt).toLocaleString()} · {a.severity}
                  </div>
                  <div className="font-medium">{a.summary}</div>
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>
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
