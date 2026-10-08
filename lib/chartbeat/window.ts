import type { HistoryGrain, HistoryRange } from "./types";
import { defaultGrain, historySpec, parseHistoryGrain, parseHistoryRange } from "./format";
import { lisbonParts, lisbonWallToUtc } from "./rollup";

/** Até onde cada grão ainda se lê no gráfico e cabe num pedido. */
export const GRAIN_MAX_MS: Record<HistoryGrain, number> = {
  minute: 36 * 3600_000,
  hour: 62 * 86400_000,
  day: 400 * 86400_000,
};

export function grainLimitLabel(grain: HistoryGrain): string {
  if (grain === "minute") return "36 horas";
  if (grain === "hour") return "60 dias";
  return "400 dias";
}

/**
 * Mantém o grão pedido quando a janela cabe nele.
 * Se não couber, desce para hora e depois para dia.
 */
export function finestReadableGrain(spanMs: number, preferred: HistoryGrain): HistoryGrain {
  const order: HistoryGrain[] = ["minute", "hour", "day"];
  const start = Math.max(0, order.indexOf(preferred));
  for (let i = start; i < order.length; i++) {
    const grain = order[i]!;
    if (spanMs <= GRAIN_MAX_MS[grain]) return grain;
  }
  return "day";
}

export function grainFits(spanMs: number, grain: HistoryGrain): boolean {
  return spanMs <= GRAIN_MAX_MS[grain];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Relógio de Lisboa para os inputs `date` + `time` (sem fuso do browser). */
export function lisbonFields(d: Date): { date: string; time: string } {
  const p = lisbonParts(d);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Interpreta data e hora como parede de Europe/Lisbon. Devolve null se a data não existir. */
export function parseLisbonFields(date: string, time: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{2}):(\d{2})$/.exec((time || "00:00").trim());
  if (!m || !t) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const instant = lisbonWallToUtc(year, month, day, hour, minute);
  const back = lisbonParts(instant);
  if (back.year !== year || back.month !== month || back.day !== day || back.hour !== hour || back.minute !== minute) {
    return null;
  }
  return instant;
}

export interface HistoryWindow {
  range: HistoryRange;
  grain: HistoryGrain;
  from: Date;
  to: Date;
}

export function resolveHistoryWindow(
  params: {
    range: string | null;
    grain: string | null;
    from: string | null;
    to: string | null;
  },
  now = new Date()
): { ok: true; window: HistoryWindow } | { ok: false; error: string } {
  const custom = params.range === "custom" || params.from != null || params.to != null;
  if (custom) {
    if (!params.from || !params.to) {
      return { ok: false, error: "Indica a data de início e a de fim." };
    }
    const from = new Date(params.from);
    const to = new Date(params.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, error: "Datas inválidas." };
    }
    if (to.getTime() <= from.getTime()) {
      return { ok: false, error: "A data de fim tem de ser depois da de início." };
    }
    const span = to.getTime() - from.getTime();
    if (span > GRAIN_MAX_MS.day) {
      return { ok: false, error: "O intervalo máximo é 400 dias." };
    }
    const preferred =
      params.grain === "minute" || params.grain === "hour" || params.grain === "day"
        ? params.grain
        : defaultGrain("custom");
    return {
      ok: true,
      window: { range: "custom", grain: finestReadableGrain(span, preferred), from, to },
    };
  }

  const range = parseHistoryRange(params.range);
  const spec = historySpec(range);
  const to = now;
  const from = new Date(now.getTime() - spec.ms);
  const preferred = parseHistoryGrain(params.grain, range);
  return {
    ok: true,
    window: { range, grain: finestReadableGrain(spec.ms, preferred), from, to },
  };
}
