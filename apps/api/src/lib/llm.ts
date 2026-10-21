import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";

export type LlmBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
/** Assistant turns are replayed verbatim (`raw`) so signed thinking blocks survive the tool loop. */
export type LlmContent = string | (LlmBlock | ToolResult | Record<string, unknown>)[];
export interface LlmMessage { role: "user" | "assistant"; content: LlmContent }
export interface LlmTool { name: string; description: string; input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[] } }
export interface LlmUsage { input: number; output: number }
export interface LlmRound {
  /** Parsed text and tool calls, for our logic. */
  content: LlmBlock[];
  /** Every block exactly as returned (thinking, text, tool_use…) — send this back as the assistant turn. */
  raw?: Record<string, unknown>[];
  stop_reason: string | null;
  usage?: LlmUsage;
}

/** One model round (streams text through onText). A port so tests and evals can script the model. */
export interface LlmPort { readonly model: string; round(req: { system: string; messages: LlmMessage[]; tools: LlmTool[] }, onText: (delta: string) => void, signal?: AbortSignal): Promise<LlmRound> }

/** Models that accept output_config.effort (per Anthropic docs). Others get no effort field. */
export const supportsEffort = (model: string) => /haiku-5|sonnet-4-6|sonnet-5|opus-4-[5-9]|opus-5|fable|mythos/.test(model);

export function createLlm(c: Config): LlmPort | null {
  if (!c.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: c.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  return {
    model: c.AI_MODEL,
    async round(req, onText, signal) {
      // No sampling parameters: newer models reject non-default temperature/top_p.
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: c.AI_MODEL, max_tokens: c.AI_MAX_TOKENS, system: req.system,
        messages: req.messages as Anthropic.MessageParam[], tools: req.tools as Anthropic.Tool[],
        ...(c.AI_EFFORT && supportsEffort(c.AI_MODEL) ? { output_config: { effort: c.AI_EFFORT } } : {}),
      };
      const stream = client.messages.stream(params, { signal });
      stream.on("text", onText);
      const msg = await stream.finalMessage();
      const raw = msg.content.map((b) => ({ ...b }) as Record<string, unknown>);
      const content: LlmBlock[] = [];
      for (const b of msg.content) {
        if (b.type === "text") content.push({ type: "text", text: b.text });
        else if (b.type === "tool_use") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, unknown> });
      }
      return { content, raw, stop_reason: msg.stop_reason, usage: { input: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0), output: msg.usage.output_tokens } };
    },
  };
}
