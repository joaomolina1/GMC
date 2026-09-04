import { describe, expect, it } from "vitest";
import {
  ADS_PER_DAY,
  DAILY_REWARD,
  WEEKLY_BONUS,
  adsLeftToday,
  episodesUnlockable,
  formatCount,
  isPlusActive,
  streakView,
  unlockCost,
} from "@lib/tvibox/economy";

describe("formatCount", () => {
  it("formata contagens à portuguesa", () => {
    expect(formatCount(892)).toBe("892");
    expect(formatCount(14200)).toBe("14,2 mil");
    expect(formatCount(21000)).toBe("21 mil");
    expect(formatCount(1_300_000)).toBe("1,3 M");
    expect(formatCount(-5)).toBe("0");
  });
});

describe("unlockCost", () => {
  it("episódios grátis custam 0 e TVI Box+ anula o custo", () => {
    expect(unlockCost({ is_free: true, coin_cost: 15 }, false)).toBe(0);
    expect(unlockCost({ is_free: false, coin_cost: 15 }, false)).toBe(15);
    expect(unlockCost({ is_free: false, coin_cost: 15 }, true)).toBe(0);
  });

  it("isPlusActive compara com o instante atual", () => {
    const now = Date.parse("2026-09-04T12:00:00Z");
    expect(isPlusActive("2026-09-10T00:00:00Z", now)).toBe(true);
    expect(isPlusActive("2026-09-01T00:00:00Z", now)).toBe(false);
    expect(isPlusActive(null, now)).toBe(false);
  });

  it("episodesUnlockable arredonda para baixo", () => {
    expect(episodesUnlockable(120, 15)).toBe(8);
    expect(episodesUnlockable(14, 15)).toBe(0);
    expect(episodesUnlockable(60)).toBe(4);
  });
});

describe("streakView", () => {
  it("sem check-in ontem a sequência recomeça em 1", () => {
    const v = streakView(4, "2026-09-01", "2026-09-04");
    expect(v.streak).toBe(0);
    expect(v.canClaim).toBe(true);
    expect(v.days[0]).toMatchObject({ index: 1, done: false, today: true, reward: DAILY_REWARD });
  });

  it("check-in de ontem mantém a sequência e aponta para o dia seguinte", () => {
    const v = streakView(4, "2026-09-03", "2026-09-04");
    expect(v.streak).toBe(4);
    expect(v.days.filter((d) => d.done)).toHaveLength(4);
    expect(v.days[4]).toMatchObject({ index: 5, today: true });
  });

  it("já resgatado hoje bloqueia o botão", () => {
    const v = streakView(6, "2026-09-04", "2026-09-04");
    expect(v.claimedToday).toBe(true);
    expect(v.canClaim).toBe(false);
    expect(v.days.some((d) => d.today)).toBe(false);
  });

  it("o 7.º dia vale o bónus semanal e avança para a semana seguinte", () => {
    const v = streakView(6, "2026-09-03", "2026-09-04");
    expect(v.nextReward).toBe(WEEKLY_BONUS);
    const next = streakView(7, "2026-09-04", "2026-09-05");
    expect(next.days[0].index).toBe(8);
    expect(next.days.every((d) => !d.done)).toBe(true);
  });
});

describe("adsLeftToday", () => {
  it("reinicia o contador noutro dia", () => {
    expect(adsLeftToday(5, "2026-09-03", "2026-09-04")).toBe(ADS_PER_DAY);
    expect(adsLeftToday(3, "2026-09-04", "2026-09-04")).toBe(2);
    expect(adsLeftToday(9, "2026-09-04", "2026-09-04")).toBe(0);
  });
});
