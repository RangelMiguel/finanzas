"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import Link from "next/link";

type PublicAi = {
  provider: "xai" | "openai" | "gemini" | "custom";
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string | null;
  consented: boolean;
  usingFamilyKey: boolean;
  familyShared: boolean;
  canManageFamily: boolean;
};

export function AiSettingsCard() {
  const { t } = useApp();
  const copy = t.ai;
  const [ai, setAi] = useState<PublicAi | null>(null);
  const [provider, setProvider] = useState<PublicAi["provider"]>("xai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("grok-4.5");
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [shareWithFamily, setShareWithFamily] = useState(false);

  async function load() {
    const res = await api<{ ai: PublicAi }>("/api/ai/settings");
    setAi(res.ai);
    setProvider(res.ai.provider);
    setBaseUrl(res.ai.baseUrl);
    setModel(res.ai.model);
    setConsent(res.ai.consented);
    setShareWithFamily(res.ai.familyShared);
    setApiKey("");
  }

  useEffect(() => {
    load().catch((e) => toast.error(e instanceof Error ? e.message : t.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!ai) return;
    try {
      const res = await api<{ ai: PublicAi }>("/api/ai/settings", {
        method: "PATCH",
        json: {
          provider,
          baseUrl,
          model,
          apiKey: apiKey.trim() || undefined,
          consent,
          shareWithFamily: ai.canManageFamily ? shareWithFamily : undefined,
        },
      });
      setAi(res.ai);
      setApiKey("");
      setShareWithFamily(res.ai.familyShared);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function clearKey() {
    try {
      const res = await api<{ ai: PublicAi }>("/api/ai/settings", {
        method: "PATCH",
        json: { clearKey: true },
      });
      setAi(res.ai);
      setApiKey("");
      toast.success(copy.keyCleared);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  if (!ai) return null;

  return (
    <Card premium>
      <CardHeader>
        <CardTitle>{copy.settingsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--fg-muted)]">{copy.settingsSub}</p>
        <div>
          <Label>{copy.provider}</Label>
          <Select
            className="mt-1"
            value={provider}
            onChange={(e) => setProvider(e.target.value as PublicAi["provider"])}
          >
            <option value="xai">{copy.providerXai}</option>
            <option value="openai">{copy.providerOpenai}</option>
            <option value="gemini">{copy.providerGemini}</option>
            <option value="custom">{copy.providerCustom}</option>
          </Select>
        </div>
        {(provider === "custom" || provider === "xai" || provider === "openai") && (
          <div>
            <Label>{copy.baseUrl}</Label>
            <Input
              className="mt-1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "custom"
                  ? "http://127.0.0.1:11434/v1"
                  : provider === "openai"
                    ? "https://api.openai.com/v1"
                    : "https://api.x.ai/v1"
              }
            />
            <p className="mt-1 text-xs text-[var(--fg-faint)]">{copy.baseUrlHint}</p>
          </div>
        )}
        <div>
          <Label>{copy.model}</Label>
          <Input className="mt-1" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <Label>{copy.apiKey}</Label>
          <Input
            className="mt-1"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={ai.hasKey ? ai.keyHint || "••••" : copy.apiKeyHint}
          />
          {ai.hasKey && (
            <button type="button" className="mt-1 text-xs text-[var(--accent)]" onClick={clearKey}>
              {copy.clearKey}
            </button>
          )}
        </div>
        {ai.usingFamilyKey && (
          <p className="text-xs text-[var(--fg-muted)]">{copy.usingFamilyKey}</p>
        )}
        {ai.canManageFamily && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={shareWithFamily}
              onChange={(e) => setShareWithFamily(e.target.checked)}
            />
            <span>
              <span className="font-medium text-[var(--fg)]">{copy.shareFamily}</span>
              <span className="mt-1 block text-xs text-[var(--fg-faint)]">{copy.shareFamilyHint}</span>
              {shareWithFamily && (
                <span className="mt-1 block text-xs text-[var(--fg-muted)]">{copy.familySharedOn}</span>
              )}
            </span>
          </label>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            <span className="font-medium text-[var(--fg)]">{copy.consentTitle}</span>
            <span className="mt-1 block text-xs text-[var(--fg-faint)]">{copy.consentBody}</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save}>{copy.save}</Button>
          <Link href="/ai" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
            {copy.openChat}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
