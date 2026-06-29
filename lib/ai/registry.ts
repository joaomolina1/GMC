import { AnthropicProvider } from "./providers/anthropic";
import type { ModelPricing, TokenUsage } from "./types";
import { calculateCost } from "./types";
import type { AIProvider } from "./types";

const providers: Record<string, () => AIProvider> = {
  anthropic: () => new AnthropicProvider(),
};

const modelRegistry: Record<string, { provider: string; pricing: ModelPricing }> = {
  "claude-opus-4-20250514": {
    provider: "anthropic",
    pricing: { inputPricePerMtok: 15.0, outputPricePerMtok: 75.0 },
  },
  "claude-sonnet-4-20250514": {
    provider: "anthropic",
    pricing: { inputPricePerMtok: 3.0, outputPricePerMtok: 15.0 },
  },
  "claude-3-5-sonnet-20241022": {
    provider: "anthropic",
    pricing: { inputPricePerMtok: 3.0, outputPricePerMtok: 15.0 },
  },
  "claude-3-5-haiku-20241022": {
    provider: "anthropic",
    pricing: { inputPricePerMtok: 0.8, outputPricePerMtok: 4.0 },
  },
};

export function getProvider(modelId: string): AIProvider {
  const entry = modelRegistry[modelId];
  if (!entry) throw new Error(`Unknown model: ${modelId}`);
  const factory = providers[entry.provider];
  if (!factory) throw new Error(`Unknown provider: ${entry.provider}`);
  return factory();
}

export function getModelPricing(modelId: string): ModelPricing {
  const entry = modelRegistry[modelId];
  if (!entry) return { inputPricePerMtok: 3.0, outputPricePerMtok: 15.0 };
  return entry.pricing;
}

export function computeModelCost(modelId: string, usage: TokenUsage): number {
  return calculateCost(usage, getModelPricing(modelId));
}

export { modelRegistry };
