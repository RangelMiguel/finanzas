import { canAdmin, getActiveMembership } from "@/lib/auth";
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
  source: "personal" | "family" | "none";
  usingFamilyKey: boolean;
  familyShared: boolean;
  familyHasKey: boolean;
  canManageFamily: boolean;
};

type HouseholdAi = {
  aiShared: boolean;
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKeyEnc: string;
};

function decryptHint(enc?: string | null): string | null {
  if (!enc) return null;
  try {
    return maskSecret(decryptSecret(enc));
  } catch {
    return "••••";
  }
}

function decryptKey(enc?: string | null): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    return "";
  }
}

function configured(provider: AiProvider, apiKey: string, baseUrl: string): boolean {
  if (provider === "custom") return Boolean(baseUrl);
  return Boolean(apiKey);
}

export async function loadPublicAiSettings(userId: string): Promise<PublicAiSettings> {
  const [pref, membership] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    getActiveMembership(userId),
  ]);
  const household = membership?.household as HouseholdAi | undefined;
  const familyShared = Boolean(household?.aiShared);
  const familyKey = familyShared ? decryptKey(household?.aiApiKeyEnc) : "";
  const familyProvider = household && isAiProvider(household.aiProvider) ? household.aiProvider : "xai";
  const personalProvider = pref && isAiProvider(pref.aiProvider) ? pref.aiProvider : "xai";
  const personalKey = decryptKey(pref?.aiApiKeyEnc);
  const personalReady = pref ? configured(personalProvider, personalKey, pref.aiBaseUrl) : false;
  const familyReady =
    familyShared && household ? configured(familyProvider, familyKey, household.aiBaseUrl) : false;
  const useFamily = !personalReady && familyReady;
  const provider = useFamily ? familyProvider : personalProvider;
  const baseUrl = useFamily ? household!.aiBaseUrl : pref?.aiBaseUrl ?? "";
  const model = useFamily
    ? household!.aiModel || defaultModel(provider)
    : pref?.aiModel || defaultModel(provider);
  const hasKey = useFamily ? Boolean(household?.aiApiKeyEnc) : Boolean(pref?.aiApiKeyEnc);
  return {
    provider,
    baseUrl,
    model,
    hasKey: hasKey || (provider === "custom" && Boolean(baseUrl)),
    keyHint: useFamily ? decryptHint(household?.aiApiKeyEnc) : decryptHint(pref?.aiApiKeyEnc),
    consented: Boolean(pref?.aiConsentAt),
    consentAt: pref?.aiConsentAt?.toISOString() ?? null,
    source: personalReady ? "personal" : familyReady ? "family" : "none",
    usingFamilyKey: useFamily,
    familyShared,
    familyHasKey: Boolean(household?.aiApiKeyEnc),
    canManageFamily: Boolean(membership && canAdmin(membership.role)),
  };
}

export async function loadPrivateAiSettings(userId: string): Promise<AiSettings | null> {
  const [pref, membership] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    getActiveMembership(userId),
  ]);
  const household = membership?.household as HouseholdAi | undefined;
  if (pref) {
    const provider = isAiProvider(pref.aiProvider) ? pref.aiProvider : "xai";
    const apiKey = decryptKey(pref.aiApiKeyEnc);
    if (configured(provider, apiKey, pref.aiBaseUrl)) {
      return {
        provider,
        baseUrl: pref.aiBaseUrl,
        model: pref.aiModel || defaultModel(provider),
        apiKey,
      };
    }
  }
  if (household?.aiShared) {
    const provider = isAiProvider(household.aiProvider) ? household.aiProvider : "xai";
    const apiKey = decryptKey(household.aiApiKeyEnc);
    if (configured(provider, apiKey, household.aiBaseUrl)) {
      return {
        provider,
        baseUrl: household.aiBaseUrl,
        model: household.aiModel || defaultModel(provider),
        apiKey,
      };
    }
  }
  return null;
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
    shareWithFamily?: boolean;
  }
) {
  const [current, membership] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    getActiveMembership(userId),
  ]);
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
    aiModel:
      input.model !== undefined
        ? input.model.trim() || defaultModel(provider)
        : current?.aiModel || defaultModel(provider),
    aiApiKeyEnc,
    ...(input.consent === true ? { aiConsentAt: new Date() } : {}),
    ...(input.consent === false ? { aiConsentAt: null } : {}),
  };
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, householdId: membership?.householdId, ...data },
    update: data,
  });

  if (input.shareWithFamily !== undefined) {
    if (!membership || !canAdmin(membership.role)) {
      throw new Error("Solo un admin de la familia puede compartir la llave de IA");
    }
    const household = membership.household as HouseholdAi;
    const familyEnc = data.aiApiKeyEnc || (input.clearKey ? "" : household.aiApiKeyEnc || "");
    await prisma.household.update({
      where: { id: membership.householdId },
      data: {
        aiShared: input.shareWithFamily && Boolean(familyEnc || data.aiBaseUrl),
        aiProvider: data.aiProvider,
        aiBaseUrl: data.aiBaseUrl,
        aiModel: data.aiModel,
        aiApiKeyEnc: familyEnc,
      },
    });
  }

  return loadPublicAiSettings(userId);
}
