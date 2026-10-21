/**
 * USD per million tokens (base rates), from https://platform.claude.com/docs/en/about-claude/pricing — checked 2026-10-21.
 * Used for cost telemetry and the admin dashboard only; billing truth is the Anthropic console.
 * Haiku 5.5 doubles above 100K prompt tokens — Vihaan prompts are far below that.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Estimated cost in USD; unknown models are priced at the most expensive known rate so budgets stay conservative. */
export function costUsd(model: string, inputTokens: number, outputTokens: number) {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  const p = key ? PRICES[key] : { input: 15, output: 75 };
  return (inputTokens * p.input + outputTokens * p.output) / 1e6;
}
