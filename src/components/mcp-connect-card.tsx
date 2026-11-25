"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { grokMcpCommand } from "@/lib/mcp/command";

type McpToken = {
  id: string;
  label: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  householdName: string;
};

export function McpConnectCard() {
  const { t, locale } = useApp();
  const { confirm } = useConfirm();
  const copy = t.settings.mcp;
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [label, setLabel] = useState("");
  const [bypass, setBypass] = useState("");
  const [tokenOnce, setTokenOnce] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api<{ tokens: McpToken[] }>("/api/mcp/tokens");
    setTokens(res.tokens ?? []);
  }

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/mcp`);
    load().catch((error) => toast.error(error instanceof Error ? error.message : t.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyText(value: string, ok: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(ok);
    } catch {
      toast.error(t.error);
    }
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ token: string; credential: McpToken }>("/api/mcp/tokens", {
        method: "POST",
        json: { label: label.trim() || undefined },
      });
      setTokenOnce(res.token);
      setFreshId(res.credential.id);
      setLabel("");
      toast.success(copy.created);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const ok = await confirm({
      title: copy.revoke,
      description: copy.confirmRevoke,
      confirmLabel: copy.revoke,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api("/api/mcp/tokens", { method: "DELETE", json: { id } });
      if (id === freshId) {
        setTokenOnce(null);
        setFreshId(null);
      }
      toast.success(copy.revoked);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.error);
    }
  }

  if (!tokens) return null;

  const when = (iso: string | null) => {
    if (!iso) return copy.neverUsed;
    return new Date(iso).toLocaleString(locale === "en" ? "en" : "es");
  };
  const command =
    tokenOnce && endpoint ? grokMcpCommand(endpoint, tokenOnce, bypass) : "";

  return (
    <Card premium>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--fg-muted)]">{copy.subtitle}</p>
        <p className="text-xs text-[var(--fg-faint)]">{copy.protection}</p>

        <div>
          <Label>{copy.endpoint}</Label>
          <code className="mt-1 block break-all text-sm text-[var(--fg)]">{endpoint}</code>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            disabled={!endpoint}
            onClick={() => copyText(endpoint, copy.endpointCopied)}
          >
            {copy.copyEndpoint}
          </Button>
          <p className="mt-1 text-xs text-[var(--fg-faint)]">{copy.endpointHint}</p>
        </div>

        <div>
          <Label>{copy.bypass}</Label>
          <Input
            className="mt-1"
            type="password"
            autoComplete="off"
            value={bypass}
            placeholder={copy.bypassPlaceholder}
            onChange={(event) => setBypass(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label>{copy.label}</Label>
            <Input
              className="mt-1"
              value={label}
              maxLength={40}
              placeholder={copy.labelPlaceholder}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button disabled={busy} onClick={generate}>
              {copy.generate}
            </Button>
          </div>
        </div>
        <p className="text-xs text-[var(--fg-faint)]">{copy.limit}</p>

        {tokenOnce && (
          <div className="rounded-xl border border-[var(--line)] bg-black/20 p-3">
            <p className="text-xs text-[var(--fg-faint)]">{copy.tokenOnce}</p>
            <code className="mt-2 block break-all text-sm text-[var(--fg)]">{tokenOnce}</code>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => copyText(tokenOnce, copy.tokenCopied)}>
                {copy.copyKey}
              </Button>
            </div>
            <p className="mt-3 text-xs text-[var(--fg-faint)]">{copy.command}</p>
            <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-[var(--fg)]">{command}</pre>
            <p className="mt-2 text-xs text-[var(--fg-faint)]">{copy.removeFirst}</p>
            <Button className="mt-2" size="sm" onClick={() => copyText(command, copy.commandCopied)}>
              {copy.copyCommand}
            </Button>
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">{copy.noTokens}</p>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] p-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">{token.label}</p>
                  <p className="text-xs text-[var(--fg-faint)]">
                    {token.tokenPrefix}… · {token.householdName}
                  </p>
                  <p className="text-xs text-[var(--fg-muted)]">
                    {copy.lastUsed}: {when(token.lastUsedAt)}
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => revoke(token.id)}>
                  {copy.revoke}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
