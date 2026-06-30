import type { TokenUsage } from "@lib/ai/types";

export const CACHE_CONTROL_EPHEMERAL = { type: "ephemeral" as const };

export function buildCachedSystem(
  systemPrompt: string | undefined
): string | Array<{ type: "text"; text: string; cache_control: typeof CACHE_CONTROL_EPHEMERAL }> | undefined {
  if (!systemPrompt?.trim()) return undefined;
  return [
    {
      type: "text",
      text: systemPrompt,
      cache_control: CACHE_CONTROL_EPHEMERAL,
    },
  ];
}

/** Mark the last tool definition as a cache breakpoint (stable prefix). */
export function applyCacheToTools<T extends { cache_control?: unknown }>(tools: T[]): T[] {
  if (tools.length === 0) return tools;
  return tools.map((tool, index) =>
    index === tools.length - 1 ? { ...tool, cache_control: CACHE_CONTROL_EPHEMERAL } : { ...tool }
  );
}

export interface AnthropicUsageFields {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function addAnthropicUsage(totals: TokenUsage, usage: AnthropicUsageFields): TokenUsage {
  return {
    promptTokens: totals.promptTokens + usage.input_tokens,
    completionTokens: totals.completionTokens + usage.output_tokens,
    cacheCreationTokens:
      (totals.cacheCreationTokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    cacheReadTokens: (totals.cacheReadTokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
  };
}

export function emptyTokenUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
}

export function usageCacheMetadata(usage: TokenUsage): Record<string, number> {
  return {
    cache_read_input_tokens: usage.cacheReadTokens ?? 0,
    cache_creation_input_tokens: usage.cacheCreationTokens ?? 0,
    fresh_input_tokens: Math.max(
      0,
      usage.promptTokens - (usage.cacheReadTokens ?? 0) - (usage.cacheCreationTokens ?? 0)
    ),
  };
}
