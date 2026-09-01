import { describe, expect, it } from "vitest";
import {
  LATEST_TIER_MODEL_IDS,
  capabilitiesFromApi,
  getCatalogEntry,
  inferPricing,
  inferTier,
  inferUnknownModel,
  isModelSelectable,
  modelHasCapability,
} from "@lib/ai/anthropic-catalog";

describe("anthropic catalog", () => {
  it("marks current frontier models as active", () => {
    expect(getCatalogEntry("claude-opus-5")?.status).toBe("active");
    expect(getCatalogEntry("claude-sonnet-5")?.status).toBe("active");
    expect(getCatalogEntry("claude-haiku-4-5")?.status).toBe("active");
    expect(getCatalogEntry("claude-fable-5")?.status).toBe("active");
  });

  it("demotes previous generation to legacy", () => {
    expect(getCatalogEntry("claude-opus-4-8")?.status).toBe("legacy");
    expect(getCatalogEntry("claude-sonnet-4-6")?.status).toBe("legacy");
  });

  it("exposes latest ids per tier", () => {
    expect([...LATEST_TIER_MODEL_IDS]).toEqual(
      expect.arrayContaining(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"])
    );
  });

  it("treats active/legacy/deprecated as selectable", () => {
    expect(isModelSelectable("active")).toBe(true);
    expect(isModelSelectable("legacy")).toBe(true);
    expect(isModelSelectable("deprecated")).toBe(true);
    expect(isModelSelectable("retired")).toBe(false);
  });
});

describe("inferUnknownModel", () => {
  it("infers opus-5 pricing and effort", () => {
    const entry = inferUnknownModel("claude-opus-5-20260724");
    expect(entry.tier).toBe("opus");
    expect(entry.inputPricePerMtok).toBe(5);
    expect(entry.capabilities).toContain("effort");
  });

  it("infers sonnet-5 pricing", () => {
    expect(inferPricing("claude-sonnet-5").inputPricePerMtok).toBe(2);
    expect(inferPricing("claude-sonnet-5").outputPricePerMtok).toBe(10);
  });

  it("maps API capabilities", () => {
    const caps = capabilitiesFromApi({
      image_input: { supported: true },
      code_execution: { supported: true },
      thinking: { supported: true },
      effort: { supported: true, high: { supported: true } },
    });
    expect(caps).toEqual(expect.arrayContaining(["chat", "vision", "tools", "thinking", "effort"]));
  });

  it("uses API display name for unknown ids", () => {
    const entry = inferUnknownModel("claude-sonnet-5-preview", {
      display_name: "Claude Sonnet 5 Preview",
    });
    expect(entry.displayName).toBe("Claude Sonnet 5 Preview");
    expect(inferTier(entry.id)).toBe("sonnet");
  });
});

describe("modelHasCapability", () => {
  it("reads catalog capabilities", () => {
    expect(modelHasCapability("claude-opus-5", "effort")).toBe(true);
    expect(modelHasCapability("claude-haiku-4-5", "effort")).toBe(false);
    expect(modelHasCapability("claude-haiku-4-5", "thinking")).toBe(true);
  });
});
