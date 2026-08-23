"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Sparkles } from "lucide-react";

type Action = { name: string; summary: string };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };

export default function AiPage() {
  const { t } = useApp();
  const copy = t.ai;
  const [ready, setReady] = useState<{ consented: boolean; configured: boolean } | null>(null);
  const [consent, setConsent] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ ai: { consented: boolean; hasKey: boolean; provider: string; baseUrl: string } }>(
      "/api/ai/settings"
    )
      .then((res) => {
        const configured =
          res.ai.hasKey || (res.ai.provider === "custom" && Boolean(res.ai.baseUrl));
        setReady({ consented: res.ai.consented, configured });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t.error));
  }, [t.error]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function acceptConsent() {
    if (!consent) {
      toast.error(copy.consentRequired);
      return;
    }
    try {
      await api("/api/ai/settings", { method: "PATCH", json: { consent: true } });
      setReady((prev) => (prev ? { ...prev, consented: true } : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await api<{ reply: string; actions?: Action[] }>("/api/ai/ask", {
        method: "POST",
        json: { messages: next },
      });
      setMessages([
        ...next,
        { role: "assistant", content: res.reply, actions: res.actions ?? [] },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader kicker={t.nav.ai} title={copy.title} subtitle={copy.subtitle} />

      {ready && !ready.consented && (
        <Card premium>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-[var(--fg)]">{copy.consentTitle}</p>
            <p className="text-sm text-[var(--fg-muted)]">{copy.consentBody}</p>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>{copy.consentCheck}</span>
            </label>
            <Button onClick={acceptConsent}>{copy.consentAccept}</Button>
          </CardContent>
        </Card>
      )}

      {ready?.consented && !ready.configured && (
        <Card premium>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm text-[var(--fg-muted)]">{copy.needKey}</p>
            <Link href="/settings" className="text-sm text-[var(--accent)] underline">
              {copy.goSettings}
            </Link>
          </CardContent>
        </Card>
      )}

      {ready?.consented && ready.configured && (
        <Card premium>
          <CardContent className="flex min-h-[28rem] flex-col gap-3 pt-5">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <p className="text-sm text-[var(--fg-muted)]">{copy.empty}</p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={`max-w-[46rem] rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "ml-auto bg-[var(--accent)]/20 px-3 py-2 text-[var(--fg)]"
                      : "bg-white/5 px-3.5 py-2.5 text-[var(--fg)]"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--fg-faint)]">
                    {msg.role === "assistant" ? <Sparkles className="h-3 w-3" /> : null}
                    {msg.role === "user" ? copy.you : copy.assistant}
                  </div>
                  {msg.role === "assistant" ? (
                    <Markdown>{msg.content}</Markdown>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                  {msg.actions && msg.actions.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {msg.actions.map((action, j) => (
                        <li
                          key={`${action.name}-${j}`}
                          className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] text-[var(--fg-muted)]"
                        >
                          {action.summary}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {busy && <p className="text-xs text-[var(--fg-faint)]">{copy.thinking}</p>}
              <div ref={endRef} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={copy.placeholder}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button onClick={() => void send()} disabled={busy || !draft.trim()}>
                {copy.send}
              </Button>
            </div>
            <p className="text-xs text-[var(--fg-faint)]">{copy.footerHint}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
