import { SERIES } from "./catalog";

/**
 * Mercado TVI BOX só em Portugal.
 *
 * View = início de episódio (o mesmo contador dos PDFs de escala / business case).
 * Cadência: 1 série completa por dia (fábrica tipo DramaBox, não 1 episódio/dia).
 * Horizonte de planeamento: mês 3, quando o catálogo deixa de ser o travão.
 *
 * Fontes (set 2026):
 * - DataReportal Digital 2026 Portugal — pop. 10,4 M; internet 9,26 M;
 *   TikTok ads 18+ 4,11 M; YouTube ads 7,59 M.
 * - Marktest/Gemius netAudience jul 2026 — TVI 3 144 636 (36,6 % 15+ continente).
 * - Marktest jun 2026 — TVI mobile 2,9 M.
 * - Relatório e Contas Media Capital 2024 — TVI Player 1 M unique users / mês.
 * - PR Media Capital 2025 — marcas TVI > 3 M UU; grupo > 4 M.
 */

export const PT_POPULATION = 10_400_000;
export const PT_INTERNET_USERS = 9_260_000;
export const TVI_DIGITAL_JUL_2026 = 3_144_636;
export const TVI_MOBILE_JUN_2026 = 2_900_000;
export const TVI_PLAYER_MAU_2024 = 1_000_000;

/**
 * Serviceable Available Market: entre o TVI Player (1 M, VOD já instalado)
 * e o TVI mobile (2,9 M). Metade do mobile TVI, enviesado a entretenimento.
 */
export const SAM = 1_500_000;

/** Duração de planeamento por episódio (PDF de escala). Tecto dos guiões = 90 s. */
export const EPISODE_SECONDS = 78;

export const SERIES_PER_DAY = 1;
export const PEAK_SHARE = 0.1;
export const DAYS_PER_MONTH = 30;

/** eCPM implícito do business case (5,5 € / 1 000 views) — só para ordem de grandeza. */
export const RPM_EUR_PER_1000 = 5.5;

export const MEAN_EPISODES =
  SERIES.reduce((acc, s) => acc + s.totalEpisodes, 0) / SERIES.length;

export type ScenarioId = "pessimista" | "normal" | "otimista";
export type HorizonId = "m1" | "m3";

export interface ScenarioInput {
  id: ScenarioId;
  label: string;
  /** Fração do SAM que instala e usa a app no mês. */
  penetration: number;
  dauMau: number;
  viewsPerDau: number;
}

export const SCENARIOS: Record<ScenarioId, ScenarioInput> = {
  pessimista: {
    id: "pessimista",
    label: "Pessimista",
    penetration: 0.06,
    dauMau: 0.18,
    viewsPerDau: 3,
  },
  normal: {
    id: "normal",
    label: "Normal",
    penetration: 0.15,
    dauMau: 0.32,
    viewsPerDau: 7,
  },
  otimista: {
    id: "otimista",
    label: "Otimista",
    penetration: 0.3,
    dauMau: 0.42,
    viewsPerDau: 12,
  },
};

/** Mês 1 ainda a formar hábito e distribuição; mês 3 = run-rate. */
export const RAMP: Record<HorizonId, Record<ScenarioId, number>> = {
  m1: { pessimista: 0.4, normal: 0.5, otimista: 0.62 },
  m3: { pessimista: 1, normal: 1, otimista: 1 },
};

export interface MarketSnapshot {
  id: ScenarioId;
  label: string;
  horizon: HorizonId;
  mau: number;
  dau: number;
  viewsDay: number;
  viewsMonth: number;
  peakCcu: number;
  watchMinPerDau: number;
  revenueMonthEur: number;
  seriesInCatalog: number;
  episodesInCatalog: number;
}

export function project(id: ScenarioId, horizon: HorizonId = "m3"): MarketSnapshot {
  const s = SCENARIOS[id];
  const ramp = RAMP[horizon][id];
  const days = horizon === "m1" ? 30 : 90;
  const seriesInCatalog = SERIES_PER_DAY * days;
  const mau = Math.round(SAM * s.penetration * ramp);
  const dau = Math.round(mau * s.dauMau);
  const viewsDay = Math.round(dau * s.viewsPerDau);
  const viewsMonth = viewsDay * DAYS_PER_MONTH;
  return {
    id,
    label: s.label,
    horizon,
    mau,
    dau,
    viewsDay,
    viewsMonth,
    peakCcu: Math.round(viewsDay * PEAK_SHARE),
    watchMinPerDau: (s.viewsPerDau * EPISODE_SECONDS) / 60,
    revenueMonthEur: (viewsMonth / 1000) * RPM_EUR_PER_1000,
    seriesInCatalog,
    episodesInCatalog: Math.round(seriesInCatalog * MEAN_EPISODES),
  };
}

export const HORIZONS: HorizonId[] = ["m1", "m3"];
export const SCENARIO_IDS: ScenarioId[] = ["pessimista", "normal", "otimista"];

export function allSnapshots(): MarketSnapshot[] {
  return HORIZONS.flatMap((h) => SCENARIO_IDS.map((id) => project(id, h)));
}

/** 5 / 10 / 20 M views/dia do business case não cabem só em Portugal. */
export function portugalCeilingViewsDay(): number {
  return project("otimista", "m3").viewsDay;
}

export function formatPtInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 48 600 → "49 mil"; 504 000 → "0,50 M"; 2 268 000 → "2,3 M". */
export function formatPtVolume(n: number): string {
  if (n >= 100_000) {
    const m = n / 1_000_000;
    const digits = m >= 10 ? 0 : m >= 2 ? 1 : m >= 1 ? 1 : 2;
    return `${m.toFixed(digits).replace(".", ",").replace(/,0$/, "")} M`;
  }
  if (n >= 10_000) {
    return `${formatPtInt(Math.round(n / 1000))} mil`;
  }
  return formatPtInt(n);
}

export function formatEurK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  if (n >= 1_000) return `${Math.round(n / 1000)} k€`;
  return `${formatPtInt(Math.round(n))} €`;
}
