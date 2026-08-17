export type AiProvider = "xai" | "openai" | "gemini" | "custom";

export type AiSettings = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OPENAI_COMPAT: Record<Exclude<AiProvider, "gemini">, string> = {
  xai: "https://api.x.ai/v1",
  openai: "https://api.openai.com/v1",
  custom: "",
};

export function defaultModel(provider: AiProvider): string {
  if (provider === "xai") return "grok-4.5";
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "gemini") return "gemini-2.0-flash";
  return "llama3.2";
}

export async function completeWithUserSettings(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: { temperature?: number }
): Promise<{ text: string; provider: string; model: string }> {
  if (settings.provider === "gemini") {
    return completeGemini(settings, messages, opts);
  }
  return completeOpenAiCompat(settings, messages, opts);
}

async function completeOpenAiCompat(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: { temperature?: number }
) {
  const fallback = OPENAI_COMPAT[settings.provider === "gemini" ? "xai" : settings.provider];
  const base = (settings.baseUrl || fallback).replace(/\/$/, "");
  if (!base) throw new Error("Falta la URL del modelo");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: settings.model || defaultModel(settings.provider),
      messages,
      temperature: opts?.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`AI ${res.status}: ${errText.slice(0, 280)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("El modelo no devolvió texto");
  return { text, provider: settings.provider, model: settings.model };
}

async function completeGemini(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: { temperature?: number }
) {
  if (!settings.apiKey) throw new Error("Falta la llave de Gemini");
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const model = settings.model || defaultModel("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: opts?.temperature ?? 0.3 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 280)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini no devolvió texto");
  return { text, provider: "gemini", model };
}
