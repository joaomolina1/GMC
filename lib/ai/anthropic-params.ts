import type { GenerateOptions } from "./types";

export type EffortLevel = "low" | "medium" | "high" | "max";

export function modelSupportsEffort(model: string): boolean {
  return (
    /claude-(opus|sonnet)-4-[68]/.test(model) ||
    model.includes("claude-opus-4-5") ||
    model.includes("claude-opus-4-6") ||
    model.includes("claude-sonnet-4-6")
  );
}

export function modelSupportsThinking(model: string): boolean {
  return modelSupportsEffort(model);
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
