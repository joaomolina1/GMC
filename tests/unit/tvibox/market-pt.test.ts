import { describe, expect, it } from "vitest";
import { SERIES } from "@lib/tvibox/catalog";
import {
  MEAN_EPISODES,
  SAM,
  SCENARIOS,
  formatPtVolume,
  portugalCeilingViewsDay,
  project,
} from "@lib/tvibox/market-pt";

describe("mercado Portugal", () => {
  it("a média de episódios segue o catálogo das 8 séries", () => {
    const mean = SERIES.reduce((a, s) => a + s.totalEpisodes, 0) / SERIES.length;
    expect(MEAN_EPISODES).toBe(mean);
    expect(MEAN_EPISODES).toBe(37.25);
  });

  it("mês 3: 49 mil / 0,50 M / 2,3 M views por dia", () => {
    const p = project("pessimista");
    const n = project("normal");
    const o = project("otimista");
    expect(p.mau).toBe(90_000);
    expect(p.dau).toBe(16_200);
    expect(p.viewsDay).toBe(48_600);
    expect(p.viewsMonth).toBe(1_458_000);
    expect(p.peakCcu).toBe(4_860);

    expect(n.mau).toBe(225_000);
    expect(n.dau).toBe(72_000);
    expect(n.viewsDay).toBe(504_000);
    expect(n.viewsMonth).toBe(15_120_000);
    expect(n.peakCcu).toBe(50_400);

    expect(o.mau).toBe(450_000);
    expect(o.dau).toBe(189_000);
    expect(o.viewsDay).toBe(2_268_000);
    expect(o.viewsMonth).toBe(68_040_000);
    expect(o.peakCcu).toBe(226_800);
  });

  it("o caso normal alinha com o patamar 0,5 M do business case", () => {
    expect(project("normal").viewsDay).toBeGreaterThan(450_000);
    expect(project("normal").viewsDay).toBeLessThan(550_000);
  });

  it("5 M views/dia ultrapassa o tecto otimista de Portugal", () => {
    expect(portugalCeilingViewsDay()).toBe(2_268_000);
    expect(5_000_000).toBeGreaterThan(portugalCeilingViewsDay());
  });

  it("o SAM fica entre o TVI Player e o TVI mobile", () => {
    expect(SAM).toBeGreaterThan(1_000_000);
    expect(SAM).toBeLessThan(2_900_000);
  });

  it("mês 1 é uma fracção do mês 3 (hábito + distribuição)", () => {
    const m1 = project("normal", "m1");
    const m3 = project("normal", "m3");
    expect(m1.viewsDay).toBe(252_000);
    expect(m1.viewsDay / m3.viewsDay).toBeCloseTo(0.5, 5);
    expect(m1.seriesInCatalog).toBe(30);
    expect(m3.seriesInCatalog).toBe(90);
  });

  it("formata volumes à portuguesa", () => {
    expect(formatPtVolume(48_600)).toBe("49 mil");
    expect(formatPtVolume(504_000)).toBe("0,50 M");
    expect(formatPtVolume(2_268_000)).toBe("2,3 M");
    expect(formatPtVolume(1_458_000)).toBe("1,5 M");
    expect(formatPtVolume(15_120_000)).toBe("15 M");
    expect(formatPtVolume(68_040_000)).toBe("68 M");
  });

  it("views/DAU crescem do pessimista para o otimista", () => {
    expect(SCENARIOS.pessimista.viewsPerDau).toBeLessThan(SCENARIOS.normal.viewsPerDau);
    expect(SCENARIOS.normal.viewsPerDau).toBeLessThan(SCENARIOS.otimista.viewsPerDau);
  });
});
