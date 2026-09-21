import type { HistoryRange } from "./types";

export const LISBON = "Europe/Lisbon";

export function formatPeople(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}

export function formatLisbon(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: LISBON, ...opts }).format(new Date(iso));
}

export function formatLisbonTime(iso: string): string {
  return formatLisbon(iso, { hour: "2-digit", minute: "2-digit" });
}

export function formatLisbonDateTime(iso: string): string {
  return formatLisbon(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const HISTORY_RANGES: { id: HistoryRange; label: string; ms: number; bucketSeconds: number }[] = [
  { id: "6h", label: "6 horas", ms: 6 * 3600_000, bucketSeconds: 60 },
  { id: "24h", label: "24 horas", ms: 24 * 3600_000, bucketSeconds: 120 },
  { id: "7d", label: "7 dias", ms: 7 * 86400_000, bucketSeconds: 900 },
  { id: "30d", label: "30 dias", ms: 30 * 86400_000, bucketSeconds: 3600 },
];

export function historySpec(range: HistoryRange) {
  return HISTORY_RANGES.find((r) => r.id === range) ?? HISTORY_RANGES[1];
}
