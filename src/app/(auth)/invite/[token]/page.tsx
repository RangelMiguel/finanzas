"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";

type InviteInfo = {
  householdName: string;
  email: string;
  role: string;
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { t, tr, refresh } = useApp();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(
    undefined
  );
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    api<InviteInfo>(`/api/invites/peek?token=${token}`)
      .then(setInfo)
      .catch((e) => setError(e.message));

    // Detect existing session without hard-failing unauthenticated users
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          setSessionEmail(null);
          return;
        }
        const data = (await res.json()) as {
          user?: { email?: string };
        };
        setSessionEmail(data.user?.email ?? null);
      })
      .catch(() => setSessionEmail(null));
  }, [token]);

  async function acceptExisting() {
    setLoading(true);
    try {
      await api("/api/invites/accept", { method: "POST", json: { token } });
      await refresh();
      toast.success(t.invite.joined);
      router.push("/");
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.message.toLowerCase().includes("autentic")) {
        setSessionEmail(null);
        return;
      }
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  async function createAccountAndJoin(e: FormEvent) {
    e.preventDefault();
    if (!info) return;
    if (!browserSupportsWebAuthn()) {
      toast.error(t.auth.passkeyUnsupported);
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        json: {
          email: info.email,
          displayName: displayName.trim(),
          inviteToken: token,
        },
      });

      const options = await api<Record<string, unknown>>(
        "/api/auth/webauthn/register",
        { method: "POST" }
      );
      const response = await startRegistration({
        optionsJSON: options as never,
      });
      await api("/api/auth/webauthn/register", {
        method: "PUT",
        json: {
          response,
          nickname: displayName.trim().slice(0, 80) || "Primary",
        },
      });

      await refresh();
      toast.success(t.invite.joinedWithAccount);
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = info
    ? t.roles[info.role as keyof typeof t.roles] || info.role
    : "";
  const isAuthed = Boolean(sessionEmail);
  const sessionMatchesInvite =
    isAuthed &&
    info &&
    sessionEmail!.toLowerCase() === info.email.toLowerCase();

  return (
    <div className="auth-card">
      <div className="auth-card-inner space-y-4">
        <h1 className="font-display text-3xl">{t.invite.title}</h1>
        {error && (
          <p className="text-sm money-expense" role="alert">
            {error}
          </p>
        )}
        {info && (
          <>
            <p className="text-sm text-[var(--fg-muted)]">
              {tr(t.invite.invitedTo, {
                name: info.householdName,
                role: roleLabel,
              })}
            </p>
            <p className="text-xs text-[var(--fg-faint)]">
              {tr(t.invite.expectedEmail, { email: info.email })}
            </p>

            {/* Session check still loading */}
            {sessionEmail === undefined && (
              <p className="text-sm text-[var(--fg-faint)]">{t.loading}</p>
            )}

            {/* Logged in with matching email → accept */}
            {isAuthed && sessionMatchesInvite && (
              <Button
                onClick={acceptExisting}
                disabled={loading}
                className="w-full"
              >
                {loading ? t.invite.joining : t.invite.accept}
              </Button>
            )}

            {/* Logged in with different email */}
            {isAuthed && !sessionMatchesInvite && (
              <div className="space-y-3">
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-[var(--fg-muted)]">
                  {tr(t.invite.wrongAccount, {
                    session: sessionEmail || "",
                    expected: info.email,
                  })}
                </p>
                <Link
                  href={`/login?next=/invite/${token}`}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-white/[0.1]"
                >
                  {t.auth.signIn}
                </Link>
              </div>
            )}

            {/* Not logged in → create account (no own home) */}
            {sessionEmail === null && (
              <form onSubmit={createAccountAndJoin} className="space-y-4">
                <p className="text-sm text-[var(--fg-muted)]">
                  {t.invite.createAccountHint}
                </p>
                <div>
                  <Label htmlFor="displayName">{t.auth.yourName}</Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    required
                    className="mt-1"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="email">{t.email}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    className="mt-1"
                    value={info.email}
                    readOnly
                    autoComplete="email"
                  />
                </div>
                <p className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--fg-muted)]">
                  <KeyRound className="mr-1 inline h-3.5 w-3.5" />
                  {t.auth.registerPasskeyPrompt}
                </p>
                <Button type="submit" className="w-full" disabled={loading}>
                  <KeyRound className="h-4 w-4" />
                  {loading ? t.invite.joining : t.invite.createAndJoin}
                </Button>
                <p className="text-center text-xs text-[var(--fg-faint)]">
                  {t.invite.hasAccount}{" "}
                  <Link
                    className="text-[var(--accent)]"
                    href={`/login?next=/invite/${token}`}
                  >
                    {t.auth.signIn}
                  </Link>
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
