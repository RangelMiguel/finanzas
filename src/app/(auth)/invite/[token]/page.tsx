"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { t, tr } = useApp();
  const [info, setInfo] = useState<{
    householdName: string;
    email: string;
    role: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ householdName: string; email: string; role: string }>(
      `/api/invites/peek?token=${token}`
    )
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [token]);

  async function accept() {
    setLoading(true);
    try {
      await api("/api/invites/accept", { method: "POST", json: { token } });
      toast.success(t.invite.joined);
      router.push("/");
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.message.toLowerCase().includes("auth")) {
        router.push(`/login?next=/invite/${token}`);
        return;
      }
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = info
    ? t.roles[info.role as keyof typeof t.roles] || info.role
    : "";

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
            <Button onClick={accept} disabled={loading} className="w-full">
              {loading ? t.invite.joining : t.invite.accept}
            </Button>
            <p className="text-center text-xs text-[var(--fg-faint)]">
              {t.invite.needAuth}{" "}
              <Link
                className="text-[var(--accent)]"
                href={`/login?next=/invite/${token}`}
              >
                {t.auth.signIn}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
