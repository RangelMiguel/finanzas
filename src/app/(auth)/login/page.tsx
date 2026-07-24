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

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const { t, locale, setLocale, refresh } = useApp();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/auth/login", {
        method: "POST",
        json: {
          email: fd.get("email"),
          password: fd.get("password"),
        },
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
              className={`rounded-lg px-2 py-0.5 text-xs ${locale === "es" ? "bg-[var(--accent)]/20 text-[#ffe3b0]" : "text-[var(--fg-faint)]"}`}
              aria-pressed={locale === "es"}
              onClick={() => setLocale("es")}
            >
              ES
            </button>
            <button
              type="button"
              className={`rounded-lg px-2 py-0.5 text-xs ${locale === "en" ? "bg-[var(--accent)]/20 text-[#ffe3b0]" : "text-[var(--fg-faint)]"}`}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
        </div>
        <h1 className="font-display text-3xl">{t.auth.loginTitle}</h1>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">{t.auth.loginSubtitle}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1"
              autoComplete="email"
              defaultValue="alice@familia.local"
            />
          </div>
          <div>
            <Label htmlFor="password">{t.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1"
              autoComplete="current-password"
              defaultValue="familia123"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.auth.signingIn : t.login}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--fg-muted)]">
          {t.auth.noAccount}{" "}
          <Link href="/register" className="text-[var(--accent)] hover:underline">
            {t.auth.createHousehold}
          </Link>
        </p>
        <p className="mt-3 text-center text-[11px] text-[var(--fg-faint)]">
          {t.auth.demoHint}
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
