import { getCatalogEntry } from "@lib/ai/anthropic-catalog";

const DEFAULT_MAX_TOKENS = 4096;
const DOCUMENT_MAX_TOKENS = 16384;
const OPUS_MAX_TOKENS = 8192;
const SONNET_MAX_TOKENS = 8192;
const HAIKU_MAX_TOKENS = 8192;

/** Resolve max output tokens for a model id. */
export function getModelMaxTokens(modelId: string, forDocuments = false): number {
  if (forDocuments) return DOCUMENT_MAX_TOKENS;

  const entry = getCatalogEntry(modelId);
  if (!entry) return DEFAULT_MAX_TOKENS;

  if (entry.tier === "opus" || entry.tier === "fable") return OPUS_MAX_TOKENS;
  if (entry.tier === "sonnet") return SONNET_MAX_TOKENS;
  if (entry.tier === "haiku") return HAIKU_MAX_TOKENS;

  return DEFAULT_MAX_TOKENS;
}

export const DEFAULT_MAX_AGENT_STEPS = 12;
