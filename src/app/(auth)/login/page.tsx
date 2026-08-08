"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const { t, locale, setLocale, refresh } = useApp();

  async function onPasskey(e?: FormEvent) {
    e?.preventDefault();
    if (!browserSupportsWebAuthn()) {
      toast.error(t.auth.passkeyUnsupported);
      return;
    }
    setLoading(true);
    try {
      const options = await api<Record<string, unknown>>("/api/auth/webauthn/login", {
        method: "POST",
        json: email.trim() ? { email: email.trim() } : {},
      });
      const response = await startAuthentication({ optionsJSON: options as never });
      await api("/api/auth/webauthn/login", {
        method: "PUT",
        json: { response },
      });
      await refresh();
      toast.success(t.welcome);
      router.push(params.get("next") || "/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-card-inner">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-sm tracking-[0.2em] text-[var(--accent)]">
            ✦ {t.appName.toUpperCase()}
          </div>
          <div className="flex gap-1" role="group" aria-label={t.language}>
            <button
              type="button"
              className={`rounded-lg px-2 py-0.5 text-xs ${locale === "es" ? "bg-[var(--accent)]/20 text-[var(--nav-active-fg)]" : "text-[var(--fg-faint)]"}`}
              aria-pressed={locale === "es"}
              onClick={() => setLocale("es")}
            >
              ES
            </button>
            <button
              type="button"
              className={`rounded-lg px-2 py-0.5 text-xs ${locale === "en" ? "bg-[var(--accent)]/20 text-[var(--nav-active-fg)]" : "text-[var(--fg-faint)]"}`}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
        </div>
        <h1 className="font-display text-3xl">{t.auth.loginTitle}</h1>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">{t.auth.loginPasskeyOnly}</p>

        <form
          onSubmit={onPasskey}
          className="mt-6 space-y-4"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
        >
          <div>
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              className="mt-1"
              autoComplete="username webauthn"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.auth.emailOptionalPasskey}
            />
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
              {t.auth.emailOptionalPasskeyHint}
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            <KeyRound className="h-4 w-4" />
            {loading ? t.auth.passkeyWaiting : t.auth.passkeyLogin}
          </Button>
        </form>

        <p className="mt-3 text-center text-[11px] text-[var(--fg-faint)]">
          {t.auth.passkeyHint}
        </p>

        <p className="mt-4 text-center text-sm text-[var(--fg-muted)]">
          {t.auth.noAccount}{" "}
          {params.get("next")?.startsWith("/invite/") ? (
            <Link
              href={params.get("next")!}
              className="text-[var(--accent)] hover:underline"
            >
              {t.invite.createAndJoin}
            </Link>
          ) : (
            <Link href="/register" className="text-[var(--accent)] hover:underline">
              {t.auth.createHousehold}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
