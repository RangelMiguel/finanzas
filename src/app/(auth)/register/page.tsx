"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { CURRENCIES } from "@/lib/currencies";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("invite") || "";
  const [loading, setLoading] = useState(false);
  const { t, locale, setLocale, refresh } = useApp();

  // Invite signup lives on /invite/[token] (no own household)
  useEffect(() => {
    if (inviteToken) router.replace(`/invite/${inviteToken}`);
  }, [inviteToken, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!browserSupportsWebAuthn()) {
      toast.error(t.auth.passkeyUnsupported);
      return;
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/auth/register", {
        method: "POST",
        json: {
          email: fd.get("email"),
          displayName: fd.get("displayName"),
          householdName: fd.get("householdName"),
        },
      });

      // Required: create the first passkey immediately
      const options = await api<Record<string, unknown>>(
        "/api/auth/webauthn/register",
        { method: "POST" }
      );
      const response = await startRegistration({ optionsJSON: options as never });
      await api("/api/auth/webauthn/register", {
        method: "PUT",
        json: {
          response,
          nickname: String(fd.get("displayName") || "Primary").slice(0, 80),
        },
      });

      const currency = String(fd.get("currency") || "MXN");
      if (currency !== "MXN") {
        try {
          await api("/api/households", {
            method: "PATCH",
            json: { currency },
          });
        } catch {
          /* ignore */
        }
      }
      await api("/api/preferences", {
        method: "PATCH",
        json: { locale },
      });
      await refresh();
      toast.success(t.auth.accountCreatedPasskey);
      router.push("/");
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
        <h1 className="font-display text-3xl">{t.auth.registerTitle}</h1>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">{t.auth.registerPasskeyOnly}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="displayName">{t.auth.yourName}</Label>
            <Input id="displayName" name="displayName" required className="mt-1" autoComplete="name" />
          </div>
          <div>
            <Label htmlFor="email">{t.email}</Label>
            <Input id="email" name="email" type="email" required className="mt-1" autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="householdName">{t.auth.householdName}</Label>
            <Input
              id="householdName"
              name="householdName"
              placeholder={t.auth.householdPlaceholder}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="currency">{t.settings.currency}</Label>
            <Select id="currency" name="currency" className="mt-1" defaultValue="MXN">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--fg-muted)]">
            <KeyRound className="mr-1 inline h-3.5 w-3.5" />
            {t.auth.registerPasskeyPrompt}
          </p>
          <Button type="submit" className="w-full" disabled={loading}>
            <KeyRound className="h-4 w-4" />
            {loading ? t.auth.creatingPasskey : t.auth.createWithPasskey}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--fg-muted)]">
          {t.auth.hasAccount}{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline">
            {t.auth.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
