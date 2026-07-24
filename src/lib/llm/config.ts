/**
 * LLM provider configuration for receipt / statement extraction.
 *
 * Env (any one enables LLM):
 *   XAI_API_KEY or GROK_API_KEY     → Grok (xAI)
 *   GEMINI_API_KEY or GOOGLE_API_KEY → Gemini
 *
 * Optional:
 *   LLM_PROVIDER = auto | grok | gemini  (default: auto)
 *   LLM_MODEL    = override model id
 *   XAI_BASE_URL = https://api.x.ai/v1
 *   XAI_MODEL / GEMINI_MODEL = provider-specific model defaults
 */

export type LlmProvider = "grok" | "gemini";

export type LlmConfig =
  | {
      enabled: true;
      provider: LlmProvider;
      apiKey: string;
      model: string;
      baseUrl?: string;
    }
  | { enabled: false; reason: string };

function env(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function getLlmConfig(): LlmConfig {
  const preferred = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const xaiKey = env("XAI_API_KEY", "GROK_API_KEY");
  const geminiKey = env(
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY"
  );

  const grokCfg = xaiKey
    ? ({
        enabled: true as const,
        provider: "grok" as const,
        apiKey: xaiKey,
        model: env("LLM_MODEL", "XAI_MODEL") || "grok-4.5",
        baseUrl: env("XAI_BASE_URL") || "https://api.x.ai/v1",
      })
    : null;

  const geminiCfg = geminiKey
    ? ({
        enabled: true as const,
        provider: "gemini" as const,
        apiKey: geminiKey,
        model: env("LLM_MODEL", "GEMINI_MODEL") || "gemini-2.0-flash",
      })
    : null;

  if (preferred === "grok" || preferred === "xai") {
    if (grokCfg) return grokCfg;
    if (geminiCfg) return geminiCfg;
  } else if (preferred === "gemini" || preferred === "google") {
    if (geminiCfg) return geminiCfg;
    if (grokCfg) return grokCfg;
  } else {
    // auto: prefer Grok (SpaceXAI / xAI), then Gemini
    if (grokCfg) return grokCfg;
    if (geminiCfg) return geminiCfg;
  }

  return {
    enabled: false,
    reason:
      "No LLM key configured. Set XAI_API_KEY (or GROK_API_KEY) for Grok, or GEMINI_API_KEY for Gemini.",
  };
}

export function llmStatusPublic() {
  const cfg = getLlmConfig();
  if (!cfg.enabled) {
    return { enabled: false as const, provider: null as null, model: null as null };
  }
  return {
    enabled: true as const,
    provider: cfg.provider,
    model: cfg.model,
  };
}
