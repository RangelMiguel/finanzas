import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";
import { defaultModel, type AiProvider, type AiSettings } from "./complete";

export const AI_PROVIDERS: AiProvider[] = ["xai", "openai", "gemini", "custom"];

export function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}

export type PublicAiSettings = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string | null;
  consented: boolean;
  consentAt: string | null;
};

export async function loadPublicAiSettings(userId: string): Promise<PublicAiSettings> {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const provider = pref && isAiProvider(pref.aiProvider) ? pref.aiProvider : "xai";
  let keyHint: string | null = null;
  if (pref?.aiApiKeyEnc) {
    try {
      keyHint = maskSecret(decryptSecret(pref.aiApiKeyEnc));
    } catch {
      keyHint = "••••";
    }
  }
  return {
    provider,
    baseUrl: pref?.aiBaseUrl ?? "",
    model: pref?.aiModel || defaultModel(provider),
    hasKey: Boolean(pref?.aiApiKeyEnc),
    keyHint,
    consented: Boolean(pref?.aiConsentAt),
    consentAt: pref?.aiConsentAt?.toISOString() ?? null,
  };
}

export async function loadPrivateAiSettings(userId: string): Promise<AiSettings | null> {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  if (!pref) return null;
  const provider = isAiProvider(pref.aiProvider) ? pref.aiProvider : "xai";
  let apiKey = "";
  if (pref.aiApiKeyEnc) {
    try {
      apiKey = decryptSecret(pref.aiApiKeyEnc);
    } catch {
      apiKey = "";
    }
  }
  if (provider !== "custom" && !apiKey) return null;
  if (provider === "custom" && !pref.aiBaseUrl) return null;
  return {
    provider,
    baseUrl: pref.aiBaseUrl,
    model: pref.aiModel || defaultModel(provider),
    apiKey,
  };
}

export async function saveAiSettings(
  userId: string,
  input: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    clearKey?: boolean;
    consent?: boolean;
  }
) {
  const current = await prisma.userPreference.findUnique({ where: { userId } });
  const provider: AiProvider =
    input.provider && isAiProvider(input.provider)
      ? input.provider
      : current && isAiProvider(current.aiProvider)
        ? current.aiProvider
        : "xai";
  let aiApiKeyEnc = current?.aiApiKeyEnc ?? "";
  if (input.clearKey) aiApiKeyEnc = "";
  else if (input.apiKey && input.apiKey.trim() && !input.apiKey.includes("•")) {
    aiApiKeyEnc = encryptSecret(input.apiKey.trim());
  }
  const data = {
    aiProvider: provider,
    aiBaseUrl: input.baseUrl !== undefined ? input.baseUrl.trim() : current?.aiBaseUrl ?? "",
    aiModel: input.model !== undefined ? input.model.trim() || defaultModel(provider) : current?.aiModel || defaultModel(provider),
    aiApiKeyEnc,
    ...(input.consent === true ? { aiConsentAt: new Date() } : {}),
    ...(input.consent === false ? { aiConsentAt: null } : {}),
  };
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return loadPublicAiSettings(userId);
}
