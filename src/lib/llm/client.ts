import { getLlmConfig, type LlmConfig } from "./config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Call configured LLM and return text content.
 * Throws if no provider or request fails.
 */
export async function llmComplete(
  messages: ChatMessage[],
  opts?: { temperature?: number; json?: boolean }
): Promise<{ text: string; provider: string; model: string }> {
  const cfg = getLlmConfig();
  if (!cfg.enabled) {
    throw new Error(cfg.reason);
  }

  if (cfg.provider === "grok") {
    return completeGrok(cfg, messages, opts);
  }
  return completeGemini(cfg, messages, opts);
}

async function completeGrok(
  cfg: Extract<LlmConfig, { enabled: true }>,
  messages: ChatMessage[],
  opts?: { temperature?: number; json?: boolean }
) {
  const base = (cfg.baseUrl || "https://api.x.ai/v1").replace(/\/$/, "");
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts?.temperature ?? 0.1,
  };
  // Some xAI models support json_object
  if (opts?.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Grok API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Grok returned empty response");
  return { text, provider: "grok", model: cfg.model };
}

async function completeGemini(
  cfg: Extract<LlmConfig, { enabled: true }>,
  messages: ChatMessage[],
  opts?: { temperature?: number; json?: boolean }
) {
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

  // Merge consecutive same-role if needed — Gemini is usually fine with user/model alternation
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const generationConfig: Record<string, unknown> = {
    temperature: opts?.temperature ?? 0.1,
  };
  if (opts?.json) {
    generationConfig.responseMimeType = "application/json";
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig,
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned empty response");
  return { text, provider: "gemini", model: cfg.model };
}

/** Extract JSON object from model output (handles fenced code blocks). */
export function parseJsonFromLlm<T = unknown>(text: string): T {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  // find first { ... } or [ ... ]
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
  else if (arrStart >= 0) start = arrStart;
  if (start > 0) raw = raw.slice(start);
  // trim trailing junk after last } or ]
  const lastBrace = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (lastBrace > 0) raw = raw.slice(0, lastBrace + 1);
  return JSON.parse(raw) as T;
}
