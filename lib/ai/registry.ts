import { AnthropicProvider } from "./providers/anthropic";
import { getCatalogPricing } from "./anthropic-catalog";
import type { ModelPricing, TokenUsage } from "./types";
import { calculateCost } from "./types";
import type { AIProvider } from "./types";

const providers: Record<string, () => AIProvider> = {
  anthropic: () => new AnthropicProvider(),
};

const DEFAULT_PRICING: ModelPricing = {
  inputPricePerMtok: 3.0,
  outputPricePerMtok: 15.0,
};

export function isAnthropicModel(modelId: string): boolean {
  return modelId.startsWith("claude-");
}

export function getProvider(modelId: string): AIProvider {
  if (!isAnthropicModel(modelId)) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  return providers.anthropic();
}

export function getModelPricing(modelId: string): ModelPricing {
  return getCatalogPricing(modelId) ?? DEFAULT_PRICING;
}

export function computeModelCost(modelId: string, usage: TokenUsage): number {
  return calculateCost(usage, getModelPricing(modelId));
}
