import { redactForModel, redactValue, type PrivacyBook } from "./privacy";

export type AiProvider = "xai" | "openai" | "gemini" | "custom";

export type AiSettings = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
};

export type ToolExecResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
  mutated?: boolean;
  error?: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
  name?: string;
  providerParts?: Record<string, unknown>[];
};

export type { PrivacyBook };

export type AiAction = { name: string; summary: string };

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

type CompleteOpts = {
  temperature?: number;
  tools?: ToolSpec[];
  privacy?: PrivacyBook;
};

type CompletePayload = {
  text: string;
  provider: string;
  model: string;
  toolCalls: ToolCallRequest[];
  providerParts?: Record<string, unknown>[];
};

export async function completeWithUserSettings(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: { temperature?: number; privacy?: PrivacyBook }
): Promise<{ text: string; provider: string; model: string }> {
  const result = await completeOnce(settings, messages, opts);
  if (!result.text) throw new Error("El modelo no devolvió texto");
  return { text: result.text, provider: result.provider, model: result.model };
}

export async function completeWithTools(opts: {
  settings: AiSettings;
  messages: ChatMessage[];
  tools: ToolSpec[];
  execute: (call: ToolCallRequest) => Promise<ToolExecResult>;
  maxRounds?: number;
  temperature?: number;
  privacy?: PrivacyBook;
}): Promise<{ text: string; provider: string; model: string; actions: AiAction[] }> {
  const maxRounds = opts.maxRounds ?? 6;
  const messages = [...opts.messages];
  const actions: AiAction[] = [];
  let last: CompletePayload | null = null;
  let toolsEnabled = opts.tools.length > 0;

  for (let round = 0; round < maxRounds; round += 1) {
    try {
      last = await completeOnce(opts.settings, messages, {
        temperature: opts.temperature,
        tools: toolsEnabled ? opts.tools : undefined,
        privacy: opts.privacy,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        toolsEnabled &&
        !/thought_signature/i.test(msg) &&
        /unsupported|does not support|unknown tool/i.test(msg)
      ) {
        toolsEnabled = false;
        last = await completeOnce(opts.settings, messages, {
          temperature: opts.temperature,
          privacy: opts.privacy,
        });
      } else {
        throw err;
      }
    }

    if (!last.toolCalls.length) {
      const text = last.text.trim() || synthesizeActions(actions);
      if (!text) throw new Error("El modelo no devolvió texto");
      return { text, provider: last.provider, model: last.model, actions };
    }

    messages.push({
      role: "assistant",
      content: last.text,
      tool_calls: last.toolCalls,
      providerParts: last.providerParts,
    });

    for (const call of last.toolCalls) {
      let result: ToolExecResult;
      try {
        result = await opts.execute(call);
      } catch (err) {
        result = {
          ok: false,
          summary: `La herramienta ${call.name} falló`,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      if (result.mutated && result.ok) {
        actions.push({ name: call.name, summary: result.summary });
      }
      messages.push({
        role: "tool",
        name: call.name,
        tool_call_id: call.id,
        content: JSON.stringify(redactValue(result, opts.privacy)),
      });
    }
  }

  const text =
    last?.text.trim() ||
    synthesizeActions(actions) ||
    "Se detuvo después de demasiados pasos de herramientas. Revisa lo que ya se guardó.";
  return {
    text,
    provider: last?.provider || opts.settings.provider,
    model: last?.model || opts.settings.model,
    actions,
  };
}

function synthesizeActions(actions: AiAction[]): string {
  if (!actions.length) return "";
  return actions.map((action) => action.summary).join("\n");
}

async function completeOnce(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: CompleteOpts
): Promise<CompletePayload> {
  const safe = scrubMessages(messages, opts?.privacy);
  if (settings.provider === "gemini") {
    return completeGemini(settings, safe, opts);
  }
  return completeOpenAiCompat(settings, safe, opts);
}

function scrubMessages(messages: ChatMessage[], book?: PrivacyBook): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    content: redactForModel(message.content || "", book),
    tool_calls: message.tool_calls?.map((call) => ({
      ...call,
      arguments: (redactValue(call.arguments ?? {}, book) || {}) as Record<string, unknown>,
    })),
    providerParts: message.providerParts,
  }));
}

function asOpenAiTools(tools: ToolSpec[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function completeOpenAiCompat(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: CompleteOpts
): Promise<CompletePayload> {
  const fallback = OPENAI_COMPAT[settings.provider === "gemini" ? "xai" : settings.provider];
  const base = (settings.baseUrl || fallback).replace(/\/$/, "");
  if (!base) throw new Error("Falta la URL del modelo");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const body: Record<string, unknown> = {
    model: settings.model || defaultModel(settings.provider),
    messages: messages.map(toOpenAiMessage),
    temperature: opts?.temperature ?? 0.3,
  };
  if (opts?.tools?.length) {
    body.tools = asOpenAiTools(opts.tools);
    body.tool_choice = "auto";
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`AI ${res.status}: ${errText.slice(0, 280)}`);
  }
  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          id?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
    }[];
  };
  const message = data.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? [])
    .map((call, index) => ({
      id: call.id || `call_${index}_${call.function?.name || "tool"}`,
      name: call.function?.name || "",
      arguments: parseArgs(call.function?.arguments),
    }))
    .filter((call) => call.name);
  const text = (message?.content || "").trim();
  if (!text && !toolCalls.length) throw new Error("El modelo no devolvió texto");
  return { text, provider: settings.provider, model: settings.model, toolCalls };
}

function toOpenAiMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.tool_call_id || message.name || "tool",
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    };
  }
  if (message.role === "assistant" && message.tool_calls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.tool_calls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

async function completeGemini(
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: CompleteOpts
): Promise<CompletePayload> {
  if (!settings.apiKey) throw new Error("Falta la llave de Gemini");
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = toGeminiContents(messages);
  const model = settings.model || defaultModel("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: opts?.temperature ?? 0.3 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (opts?.tools?.length) {
    body.tools = [
      {
        functionDeclarations: opts.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: stripUnsupportedSchema(tool.parameters),
        })),
      },
    ];
  }
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
    candidates?: {
      content?: {
        parts?: GeminiPart[];
      };
    }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const providerParts = echoGeminiParts(parts);
  const text = visibleGeminiText(parts);
  const toolCalls = parts
    .filter((part) => part.functionCall?.name)
    .map((part, index) => {
      const call = part.functionCall!;
      return {
        id: `call_${index}_${call.name}`,
        name: call.name || "",
        arguments: call.args || call.arguments || {},
        thoughtSignature: thoughtSignatureOf(part),
      };
    });
  if (!text && !toolCalls.length) throw new Error("Gemini no devolvió texto");
  return { text, provider: "gemini", model, toolCalls, providerParts };
}

function toGeminiContents(messages: ChatMessage[]): { role: string; parts: Record<string, unknown>[] }[] {
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }
    if (message.role === "assistant") {
      if (message.providerParts?.length) {
        contents.push({ role: "model", parts: message.providerParts });
        continue;
      }
      const parts: Record<string, unknown>[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls ?? []) {
        const part: Record<string, unknown> = {
          functionCall: { name: call.name, args: call.arguments ?? {} },
        };
        if (call.thoughtSignature) part.thoughtSignature = call.thoughtSignature;
        parts.push(part);
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    const part = {
      functionResponse: {
        name: message.name || "tool",
        response: parseJsonObject(message.content),
      },
    };
    const last = contents[contents.length - 1];
    if (last?.role === "user" && last.parts.some((item) => "functionResponse" in item)) {
      last.parts.push(part);
    } else {
      contents.push({ role: "user", parts: [part] });
    }
  }
  return contents;
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  thought_signature?: string;
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
    arguments?: Record<string, unknown>;
    thoughtSignature?: string;
    thought_signature?: string;
  };
};

function thoughtSignatureOf(part: GeminiPart): string | undefined {
  const candidates = [
    part.thoughtSignature,
    part.thought_signature,
    part.functionCall?.thoughtSignature,
    part.functionCall?.thought_signature,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

function visibleGeminiText(parts: GeminiPart[]): string {
  return parts
    .filter((part) => !part.thought && !part.functionCall)
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function echoGeminiParts(parts: GeminiPart[]): Record<string, unknown>[] {
  return parts.map((part) => {
    const out: Record<string, unknown> = {};
    if (typeof part.text === "string") out.text = part.text;
    if (part.thought === true) out.thought = true;
    if (part.functionCall?.name) {
      out.functionCall = {
        name: part.functionCall.name,
        args: part.functionCall.args || part.functionCall.arguments || {},
      };
    }
    const signature = thoughtSignatureOf(part);
    if (signature) out.thoughtSignature = signature;
    return out;
  });
}

function stripUnsupportedSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { additionalProperties: _extra, ...rest } = schema;
  if (rest.properties && typeof rest.properties === "object" && !Array.isArray(rest.properties)) {
    rest.properties = Object.fromEntries(
      Object.entries(rest.properties as Record<string, unknown>).map(([key, value]) => [
        key,
        value && typeof value === "object" && !Array.isArray(value)
          ? stripUnsupportedSchema(value as Record<string, unknown>)
          : value,
      ])
    );
  }
  if (rest.items && typeof rest.items === "object" && !Array.isArray(rest.items)) {
    rest.items = stripUnsupportedSchema(rest.items as Record<string, unknown>);
  }
  return rest;
}

function parseArgs(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { _raw: raw };
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { result: parsed };
  } catch {
    return { result: raw };
  }
}
