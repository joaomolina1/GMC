import type { HistoryGrain, HistoryRange } from "./types";

export const LISBON = "Europe/Lisbon";

export function formatPeople(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}

export function formatLisbon(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: LISBON, ...opts }).format(new Date(iso));
}

export function formatLisbonTime(iso: string): string {
  return formatLisbon(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function formatLisbonDateTime(iso: string): string {
  return formatLisbon(iso, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function formatLisbonCsv(iso: string, grain: HistoryGrain): string {
  if (grain === "day") {
    return formatLisbon(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
  }
  return formatLisbon(iso, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export const HISTORY_RANGES: { id: HistoryRange; label: string; ms: number }[] = [
  { id: "6h", label: "6 horas", ms: 6 * 3600_000 },
  { id: "24h", label: "24 horas", ms: 24 * 3600_000 },
  { id: "7d", label: "7 dias", ms: 7 * 86400_000 },
  { id: "30d", label: "30 dias", ms: 30 * 86400_000 },
];

export const HISTORY_GRAINS: { id: HistoryGrain; label: string; short: string; hint: string }[] = [
  {
    id: "minute",
    label: "Ao minuto",
    short: "Minuto",
    hint: "Uma linha por minuto — o detalhe máximo",
  },
  {
    id: "hour",
    label: "Por hora",
    short: "Hora",
    hint: "Média das pessoas em cada hora (Lisboa)",
  },
  {
    id: "day",
    label: "Por dia",
    short: "Dia",
    hint: "Média das pessoas em cada dia (Lisboa)",
  },
];

export function historySpec(range: HistoryRange) {
  return HISTORY_RANGES.find((r) => r.id === range) ?? HISTORY_RANGES[1];
}

export function defaultGrain(range: HistoryRange): HistoryGrain {
  if (range === "6h" || range === "24h") return "minute";
  if (range === "7d") return "hour";
  return "day";
}

export function parseHistoryRange(raw: string | null): HistoryRange {
  return HISTORY_RANGES.some((r) => r.id === raw) ? (raw as HistoryRange) : "24h";
}

export function parseHistoryGrain(raw: string | null, range: HistoryRange): HistoryGrain {
  if (raw === "minute" || raw === "hour" || raw === "day") return raw;
  return defaultGrain(range);
}

export function grainFileSlug(grain: HistoryGrain): string {
  if (grain === "minute") return "minuto";
  if (grain === "hour") return "hora";
  return "dia";
}
