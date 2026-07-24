import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { llmStatusPublic, getLlmConfig } from "@/lib/llm/config";

export async function GET() {
  try {
    await requireSession();
    const cfg = getLlmConfig();
    return jsonOk({
      ...llmStatusPublic(),
      reason: cfg.enabled ? null : cfg.reason,
    });
  } catch (e) {
    return jsonError(e);
  }
}
