import { describe, expect, it } from "vitest";
import { csvFilename, historyToCsv } from "@lib/chartbeat/csv";
import { defaultGrain, parseHistoryGrain, parseHistoryRange } from "@lib/chartbeat/format";
import { parseHistoryBundle, parseHistoryRows } from "@lib/chartbeat/payload";
import { bucketStartUtc, rollupPoints, seriesMax } from "@lib/chartbeat/rollup";
import type { HistoryPoint } from "@lib/chartbeat/types";

describe("parseHistoryRows", () => {
  it("normaliza timestamp Postgres e jsonb", () => {
    const points = parseHistoryRows([
      { bucket: "2026-09-21 12:28:00+00", people: { tvi: 1630, cnn: 1090 } },
    ]);
    expect(points[0].bucket).toBe("2026-09-21T12:28:00.000Z");
    expect(points[0].people.tvi).toBe(1630);
  });
});

describe("parseHistoryBundle", () => {
  it("aceita array, string JSON e {points}", () => {
    const row = { bucket: "2026-09-21T12:28:00.000Z", people: { tvi: 10 } };
    expect(parseHistoryBundle([row])[0].people.tvi).toBe(10);
    expect(parseHistoryBundle(JSON.stringify([row]))[0].people.tvi).toBe(10);
    expect(parseHistoryBundle({ points: [row] })[0].people.tvi).toBe(10);
    expect(parseHistoryBundle(null)).toEqual([]);
  });
});

describe("default grain", () => {
  it("usa minuto em 6h/24h, hora em 7d, dia em 30d", () => {
    expect(defaultGrain("6h")).toBe("minute");
    expect(defaultGrain("24h")).toBe("minute");
    expect(defaultGrain("7d")).toBe("hour");
    expect(defaultGrain("30d")).toBe("day");
    expect(parseHistoryRange("nope")).toBe("24h");
    expect(parseHistoryGrain("minute", "30d")).toBe("minute");
    expect(parseHistoryGrain(null, "30d")).toBe("day");
  });
});

describe("rollupPoints", () => {
  it("média por hora de Lisboa (WEST = UTC+1 em setembro)", () => {
    const points: HistoryPoint[] = [
      { bucket: "2026-09-21T12:10:00.000Z", people: { tvi: 100, cnn: 10 } },
      { bucket: "2026-09-21T12:40:00.000Z", people: { tvi: 200, cnn: 20 } },
      { bucket: "2026-09-21T13:05:00.000Z", people: { tvi: 50, cnn: 5 } },
    ];
    const hours = rollupPoints(points, "hour");
    expect(hours).toHaveLength(2);
    expect(hours[0].bucket).toBe("2026-09-21T12:00:00.000Z");
    expect(hours[0].people.tvi).toBe(150);
    expect(hours[0].people.cnn).toBe(15);
    expect(hours[1].bucket).toBe("2026-09-21T13:00:00.000Z");
    expect(hours[1].people.tvi).toBe(50);
  });

  it("o máximo da série é o pico de um canal, não a soma empilhada", () => {
    const points: HistoryPoint[] = [
      { bucket: "2026-09-21T12:00:00.000Z", people: { tvi: 1630, cnn: 1090 } },
    ];
    expect(seriesMax(points, ["tvi", "cnn"])).toBe(1630);
  });

  it("dia de Lisboa atravessa a meia-noite UTC", () => {
    // 21 set 00:30 WEST = 20 set 23:30 UTC; 21 set 11:00 WEST = 21 set 10:00 UTC
    const points: HistoryPoint[] = [
      { bucket: "2026-09-20T22:30:00.000Z", people: { tvi: 10 } },
      { bucket: "2026-09-20T23:30:00.000Z", people: { tvi: 100 } },
      { bucket: "2026-09-21T10:00:00.000Z", people: { tvi: 200 } },
    ];
    const days = rollupPoints(points, "day");
    expect(days).toHaveLength(2);
    expect(days[0].bucket).toBe(bucketStartUtc("2026-09-20T22:30:00.000Z", "day"));
    expect(days[0].people.tvi).toBe(10);
    expect(days[1].people.tvi).toBe(150);
    expect(days[1].bucket).toBe("2026-09-20T23:00:00.000Z");
  });
});

describe("historyToCsv", () => {
  it("emite BOM, ponto-e-vírgula e colunas por canal", () => {
    const csv = historyToCsv(
      [{ bucket: "2026-09-21T12:28:00.000Z", people: { tvi: 1630, cnn: 1090 } }],
      "minute"
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toContain("datetime_lisboa");
    expect(lines[0]).toContain("TVI");
    expect(lines[0]).toContain("CNN Portugal");
    expect(lines[0].split(";")).toHaveLength(9);
    expect(lines[1].startsWith("21/09/2026")).toBe(true);
    expect(lines[1]).toContain("1630");
    expect(lines[1]).toContain("2720");
  });

  it("nomeia o ficheiro com o grain em português", () => {
    expect(csvFilename("24h", "minute", new Date("2026-09-21T12:00:00Z"))).toBe(
      "chartbeat-diretos-24h-minuto-2026-09-21.csv"
    );
    expect(csvFilename("7d", "hour", new Date("2026-09-21T12:00:00Z"))).toBe(
      "chartbeat-diretos-7d-hora-2026-09-21.csv"
    );
  });
});
