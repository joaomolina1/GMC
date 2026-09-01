import { describe, expect, it } from "vitest";
import { buildAnthropicRequestExtras, modelSupportsEffort, modelSupportsThinking } from "@lib/ai/anthropic-params";

describe("modelSupportsEffort", () => {
  it("supports Opus 5 / Sonnet 5 / Fable 5", () => {
    expect(modelSupportsEffort("claude-opus-5")).toBe(true);
    expect(modelSupportsEffort("claude-sonnet-5")).toBe(true);
    expect(modelSupportsEffort("claude-fable-5")).toBe(true);
  });

  it("does not support Haiku effort", () => {
    expect(modelSupportsEffort("claude-haiku-4-5")).toBe(false);
  });
});

describe("modelSupportsThinking", () => {
  it("supports current frontier thinking models", () => {
    expect(modelSupportsThinking("claude-opus-5")).toBe(true);
    expect(modelSupportsThinking("claude-haiku-4-5")).toBe(true);
  });
});

describe("buildAnthropicRequestExtras", () => {
  it("sends output_config.effort on Opus 5", () => {
    const extras = buildAnthropicRequestExtras({
      model: "claude-opus-5",
      messages: [],
      effort: "high",
    });
    expect(extras.output_config).toEqual({ effort: "high" });
    expect(extras.temperature).toBeUndefined();
  });

  it("falls back to temperature on Haiku", () => {
    const extras = buildAnthropicRequestExtras({
      model: "claude-haiku-4-5",
      messages: [],
      effort: "high",
      temperature: 0.2,
    });
    expect(extras.temperature).toBe(0.2);
    expect(extras.output_config).toBeUndefined();
  });

  it("enables adaptive thinking when requested", () => {
    const extras = buildAnthropicRequestExtras({
      model: "claude-sonnet-5",
      messages: [],
      thinkingEnabled: true,
    });
    expect(extras.thinking).toEqual({ type: "adaptive" });
  });
});
