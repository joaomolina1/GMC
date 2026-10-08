import { describe, expect, it } from "vitest";
import { decimateHistory } from "@lib/chartbeat/decimate";
import {
  finestReadableGrain,
  grainFits,
  lisbonFields,
  parseLisbonFields,
  resolveHistoryWindow,
} from "@lib/chartbeat/window";
import type { HistoryPoint } from "@lib/chartbeat/types";

describe("janela do gráfico", () => {
  it("mantém o minuto em 24h e passa a hora quando a janela é de dias", () => {
    expect(finestReadableGrain(24 * 3600_000, "minute")).toBe("minute");
    expect(finestReadableGrain(7 * 86400_000, "minute")).toBe("hour");
    expect(finestReadableGrain(90 * 86400_000, "hour")).toBe("day");
    expect(grainFits(24 * 3600_000, "minute")).toBe(true);
    expect(grainFits(7 * 86400_000, "minute")).toBe(false);
  });

  it("interpreta o relógio como Lisboa e rejeita dias impossíveis", () => {
    const instant = parseLisbonFields("2026-09-21", "13:00");
    expect(instant?.toISOString()).toBe("2026-09-21T12:00:00.000Z");
    expect(lisbonFields(instant!)).toEqual({ date: "2026-09-21", time: "13:00" });
    expect(parseLisbonFields("2026-02-31", "10:00")).toBeNull();
  });

  it("aceita um intervalo explícito e recusa o fim antes do início", () => {
    const now = new Date("2026-10-08T10:00:00.000Z");
    const custom = resolveHistoryWindow(
      {
        range: "custom",
        grain: "minute",
        from: "2026-10-07T10:00:00.000Z",
        to: "2026-10-08T10:00:00.000Z",
      },
      now
    );
    expect(custom.ok).toBe(true);
    if (custom.ok) {
      expect(custom.window.range).toBe("custom");
      expect(custom.window.grain).toBe("minute");
    }

    const backwards = resolveHistoryWindow(
      { range: "custom", grain: "hour", from: "2026-10-08T10:00:00.000Z", to: "2026-10-07T10:00:00.000Z" },
      now
    );
    expect(backwards.ok).toBe(false);

    const week = resolveHistoryWindow({ range: "7d", grain: "minute", from: null, to: null }, now);
    expect(week.ok).toBe(true);
    if (week.ok) expect(week.window.grain).toBe("hour");
  });
});

describe("decimateHistory", () => {
  it("guarda o pico e as pontas quando a série é longa", () => {
    const points: HistoryPoint[] = Array.from({ length: 300 }, (_, i) => ({
      bucket: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
      people: { tvi: i === 140 ? 9000 : 100 + (i % 7) },
    }));
    const drawn = decimateHistory(points, 40);
    expect(drawn.length).toBeLessThanOrEqual(40);
    expect(drawn.length).toBeGreaterThan(10);
    expect(drawn[0]?.bucket).toBe(points[0]?.bucket);
    expect(drawn[drawn.length - 1]?.bucket).toBe(points[299]?.bucket);
    expect(drawn.some((p) => p.people.tvi === 9000)).toBe(true);
  });

  it("não mexe numa série curta", () => {
    const points: HistoryPoint[] = [
      { bucket: "2026-10-08T10:00:00.000Z", people: { tvi: 10 } },
      { bucket: "2026-10-08T10:01:00.000Z", people: { tvi: 12 } },
    ];
    expect(decimateHistory(points, 40)).toBe(points);
  });
});
