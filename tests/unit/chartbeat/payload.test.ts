import { describe, expect, it } from "vitest";
import { parseHistoryRows } from "@lib/chartbeat/payload";

describe("parseHistoryRows", () => {
  it("normaliza timestamp Postgres e jsonb", () => {
    const points = parseHistoryRows([
      { bucket: "2026-09-21 12:28:00+00", people: { tvi: 1630, cnn: 1090 } },
    ]);
    expect(points[0].bucket).toBe("2026-09-21T12:28:00.000Z");
    expect(points[0].people.tvi).toBe(1630);
  });
});
