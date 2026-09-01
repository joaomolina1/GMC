import { describe, expect, it } from "vitest";
import { buildModelRows, rowFromApiModel } from "@lib/ai/sync-anthropic-models";

describe("rowFromApiModel", () => {
  it("enables models returned by the API even if catalog marked them retired", () => {
    const row = rowFromApiModel({
      id: "claude-3-5-sonnet-20241022",
      display_name: "Claude 3.5 Sonnet",
    });
    expect(row.enabled).toBe(true);
    expect(row.status).toBe("legacy");
  });

  it("fills unknown models from the API payload", () => {
    const row = rowFromApiModel({
      id: "claude-opus-5-preview",
      display_name: "Claude Opus 5 Preview",
      capabilities: {
        thinking: { supported: true },
        effort: { supported: true },
        code_execution: { supported: true },
        image_input: { supported: true },
      },
    });
    expect(row.enabled).toBe(true);
    expect(row.status).toBe("active");
    expect(row.tier).toBe("opus");
    expect(row.display_name).toBe("Claude Opus 5 Preview");
    expect(row.capabilities).toContain("effort");
  });

  it("uses catalog pricing for known ids", () => {
    const row = rowFromApiModel({
      id: "claude-sonnet-5",
      display_name: "Claude Sonnet 5",
    });
    expect(row.input_price_per_mtok).toBe(2);
    expect(row.output_price_per_mtok).toBe(10);
    expect(row.sort_order).toBe(40);
  });
});

describe("buildModelRows", () => {
  it("falls back to the full catalog when the API is empty", () => {
    const rows = buildModelRows([]);
    expect(rows.some((r) => r.id === "claude-opus-5")).toBe(true);
    expect(rows.some((r) => r.id === "claude-sonnet-5")).toBe(true);
  });

  it("keeps retired catalog entries that the API omitted", () => {
    const rows = buildModelRows([
      { id: "claude-opus-5", display_name: "Claude Opus 5" },
    ]);
    expect(rows.some((r) => r.id === "claude-opus-5")).toBe(true);
    expect(rows.some((r) => r.id === "claude-3-opus-20240229" && r.status === "retired")).toBe(
      true
    );
    expect(rows.some((r) => r.id === "claude-opus-4-8")).toBe(false);
  });
});
