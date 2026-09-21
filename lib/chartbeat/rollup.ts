import { LISBON } from "./format";
import type { HistoryGrain, HistoryPoint } from "./types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function seriesMax(points: HistoryPoint[], slugs: string[]): number {
  let m = 0;
  for (const p of points) {
    for (const slug of slugs) {
      const v = Number(p.people[slug] ?? 0);
      if (v > m) m = v;
    }
  }
  return m > 0 ? m : 1;
}

export function lisbonParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: LISBON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return {
    year: Number(o.year),
    month: Number(o.month),
    day: Number(o.day),
    hour: Number(o.hour),
    minute: Number(o.minute),
  };
}

function offsetMinutesAt(instant: Date): number {
  const p = lisbonParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return (asIfUtc - instant.getTime()) / 60_000;
}

/** Instant UTC correspondente a um relógio de parede em Europe/Lisbon. */
export function lisbonWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(utcGuess);
  const offset = offsetMinutesAt(guess);
  const instant = new Date(utcGuess - offset * 60_000);
  const offset2 = offsetMinutesAt(instant);
  if (offset2 !== offset) return new Date(utcGuess - offset2 * 60_000);
  return instant;
}

export function bucketStartUtc(iso: string, grain: HistoryGrain): string {
  const p = lisbonParts(new Date(iso));
  if (grain === "day") return lisbonWallToUtc(p.year, p.month, p.day, 0, 0).toISOString();
  if (grain === "hour") return lisbonWallToUtc(p.year, p.month, p.day, p.hour, 0).toISOString();
  return lisbonWallToUtc(p.year, p.month, p.day, p.hour, p.minute).toISOString();
}

export function lisbonBucketKey(iso: string, grain: HistoryGrain): string {
  const p = lisbonParts(new Date(iso));
  const day = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  if (grain === "day") return day;
  if (grain === "hour") return `${day}T${pad(p.hour)}`;
  return `${day}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Agrupa pontos ao minuto em hora ou dia de Lisboa, com a média das pessoas
 * em cada canal (arredondada). Minuto devolve a série ordenada sem alterar valores.
 */
export function rollupPoints(points: HistoryPoint[], grain: HistoryGrain): HistoryPoint[] {
  if (points.length === 0) return [];
  if (grain === "minute") {
    return [...points].sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  const groups = new Map<
    string,
    { bucket: string; sums: Record<string, number>; counts: Record<string, number> }
  >();

  for (const p of points) {
    const key = lisbonBucketKey(p.bucket, grain);
    let g = groups.get(key);
    if (!g) {
      g = { bucket: bucketStartUtc(p.bucket, grain), sums: {}, counts: {} };
      groups.set(key, g);
    }
    for (const [slug, n] of Object.entries(p.people)) {
      const val = Number(n) || 0;
      g.sums[slug] = (g.sums[slug] ?? 0) + val;
      g.counts[slug] = (g.counts[slug] ?? 0) + 1;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((g) => ({
      bucket: g.bucket,
      people: Object.fromEntries(
        Object.keys(g.sums).map((slug) => [slug, Math.round(g.sums[slug] / g.counts[slug])])
      ),
    }));
}
