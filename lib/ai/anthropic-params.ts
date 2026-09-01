import type { GenerateOptions } from "./types";
import { getCatalogEntry, inferUnknownModel, modelHasCapability } from "./anthropic-catalog";

export type EffortLevel = "low" | "medium" | "high" | "max";

export function modelSupportsEffort(model: string): boolean {
  if (modelHasCapability(model, "effort")) return true;
  const entry = getCatalogEntry(model) ?? inferUnknownModel(model);
  if (entry.tier === "haiku" || entry.tier === "other") return false;
  return entry.capabilities.includes("thinking");
}

export function modelSupportsThinking(model: string): boolean {
  return modelHasCapability(model, "thinking");
}

export function buildAnthropicRequestExtras(options: GenerateOptions): Record<string, unknown> {
  const extras: Record<string, unknown> = {};

  if (options.effort && modelSupportsEffort(options.model)) {
    extras.output_config = { effort: options.effort };
  } else if (options.temperature != null) {
    extras.temperature = options.temperature;
  } else {
    extras.temperature = 0.7;
  }

  if (options.thinkingEnabled && modelSupportsThinking(options.model)) {
    extras.thinking = { type: "adaptive" };
  }

  return extras;
}
