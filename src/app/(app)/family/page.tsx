"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { toast } from "sonner";
import { Copy, MessageCircle, Share2, UserMinus } from "lucide-react";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; displayName: string };
};

export default function FamilyPage() {
  const { t, tr, householdName, userId } = useApp();
  const { confirm } = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<string>("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [lastInvite, setLastInvite] = useState<{
    url: string;
    email: string;
  } | null>(null);
  const [activity, setActivity] = useState<
    {
      id: string;
      summary: string;
      createdAt: string;
      user?: { displayName: string } | null;
    }[]
  >([]);

  async function load() {
    const m = await api<{ members: Member[]; role: string }>("/api/members");
    setMembers(m.members);
    setRole(m.role);
    const dash = await api<{
      activity: {
        id: string;
        summary: string;
        createdAt: string;
        user?: { displayName: string } | null;
      }[];
    }>("/api/dashboard");
    setActivity(dash.activity || []);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  function shareMessage(url: string, inviteEmail: string) {
    return tr(t.family.shareMessage, {
      name: householdName || t.appName,
      email: inviteEmail,
      url,
    });
  }

  async function invite() {
    try {
      const res = await api<{ inviteUrl: string }>("/api/invites", {
        method: "POST",
        json: { email, role: inviteRole },
      });
      const url = `${window.location.origin}${res.inviteUrl}`;
      setLastInvite({ url, email });
      toast.success(t.family.inviteCreated);
      setEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function copyInvite() {
    if (!lastInvite) return;
    const text = shareMessage(lastInvite.url, lastInvite.email);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.family.copied);
    } catch {
      toast.error(t.error);
    }
  }

  function shareWhatsApp() {
    if (!lastInvite) return;
    const text = shareMessage(lastInvite.url, lastInvite.email);
    const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function shareSms() {
    if (!lastInvite) return;
    const text = shareMessage(lastInvite.url, lastInvite.email);
    // body= works on iOS/Android; some desktop handlers ignore it
    window.open(
      `sms:?&body=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function shareNative() {
    if (!lastInvite) return;
    const text = shareMessage(lastInvite.url, lastInvite.email);
    if (navigator.share) {
      try {
        await navigator.share({
          title: t.family.invite,
          text,
          url: lastInvite.url,
        });
        return;
      } catch {
        /* user cancelled or unsupported — fall through */
      }
    }
    await copyInvite();
  }

  async function changeRole(membershipId: string, newRole: string) {
    try {
      await api("/api/members", {
        method: "PATCH",
        json: { membershipId, role: newRole },
      });
      toast.success(t.family.roleUpdated);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const canAdmin = role === "owner" || role === "admin";

  function canRemoveMember(member: Member) {
    if (!canAdmin) return false;
    if (member.role === "owner") return false;
    if (userId && member.user.id === userId) return false;
    // Only owner may remove admins
    if (member.role === "admin" && role !== "owner") return false;
    return true;
  }

  async function removeMember(member: Member) {
    const ok = await confirm({
      title: t.delete,
      description: tr(t.family.removeConfirm, {
        name: member.user.displayName,
      }),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/members?id=${encodeURIComponent(member.id)}`, {
        method: "DELETE",
      });
      toast.success(t.family.removed);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const roleLabel = (r: string) =>
    t.roles[r as keyof typeof t.roles] || r;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.family}
        title={t.family.title}
        subtitle={t.family.subtitle}
      />

      <Card premium>
        <CardHeader>
          <CardTitle>{t.family.members}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-sm last:border-0"
            >
              <div>
                <div className="font-medium">{m.user.displayName}</div>
                <div className="text-xs text-[var(--fg-faint)]">{m.user.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {canAdmin && m.role !== "owner" ? (
                  <Select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value)}
                    className="w-auto"
                    aria-label={t.role}
                  >
                    <option value="admin">{t.roles.admin}</option>
                    <option value="member">{t.roles.member}</option>
                    <option value="viewer">{t.roles.viewer}</option>
                  </Select>
                ) : (
                  <span className="stat-pill">{roleLabel(m.role)}</span>
                )}
                {canRemoveMember(m) && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removeMember(m)}
                    aria-label={`${t.family.remove} ${m.user.displayName}`}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    {t.family.remove}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {canAdmin && (
        <Card premium>
          <CardHeader>
            <CardTitle>{t.family.invite}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-[var(--fg-faint)]">
              {t.family.inviteHint}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>{t.email}</Label>
                <Input
                  className="mt-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="familia@correo.com"
                />
              </div>
              <div>
                <Label>{t.role}</Label>
                <Select
                  className="mt-1"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="admin">{t.roles.admin}</option>
                  <option value="member">{t.roles.member}</option>
                  <option value="viewer">{t.roles.viewer}</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={invite} className="w-full sm:w-auto">
                  {t.family.invite}
                </Button>
              </div>
            </div>
            {lastInvite && (
              <div className="space-y-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 p-3">
                <p className="text-xs font-medium text-[var(--fg-muted)]">
                  {t.family.shareInvite}
                </p>
                <p className="break-all text-xs text-[var(--fg-faint)]">
                  {lastInvite.url}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={shareWhatsApp}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    {t.family.shareWhatsApp}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={shareSms}>
                    {t.family.shareSms}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={shareNative}>
                    <Share2 className="h-3.5 w-3.5" />
                    {t.family.share}
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyInvite}>
                    <Copy className="h-3.5 w-3.5" />
                    {t.family.copy}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card premium>
        <CardHeader>
          <CardTitle>{t.family.activity}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activity.length === 0 && (
            <p className="text-sm text-[var(--fg-faint)]">{t.family.noActivity}</p>
          )}
          {activity.map((a) => (
            <div key={a.id} className="text-sm text-[var(--fg-muted)]">
              <span className="text-[var(--fg-faint)]">
                {new Date(a.createdAt).toLocaleString()}
                {a.user ? ` · ${a.user.displayName}` : ""}:{" "}
              </span>
              {a.summary}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
