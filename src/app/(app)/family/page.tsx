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
import { toast } from "sonner";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; displayName: string };
};

export default function FamilyPage() {
  const { t } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<string>("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
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

  async function invite() {
    try {
      const res = await api<{ inviteUrl: string }>("/api/invites", {
        method: "POST",
        json: { email, role: inviteRole },
      });
      setLastInviteUrl(`${window.location.origin}${res.inviteUrl}`);
      toast.success(t.family.inviteCreated);
      setEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
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
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t.email}</Label>
              <Input
                className="mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              <Button onClick={invite}>{t.family.invite}</Button>
            </div>
            {lastInviteUrl && (
              <div className="sm:col-span-3 break-all rounded-xl bg-[var(--accent)]/10 p-3 text-xs">
                {t.family.link}: {lastInviteUrl}
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(lastInviteUrl);
                    toast.success(t.family.copied);
                  }}
                >
                  {t.family.copy}
                </Button>
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
