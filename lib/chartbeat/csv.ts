import { CHANNELS } from "./channels";
import { formatLisbonCsv, grainFileSlug } from "./format";
import type { HistoryGrain, HistoryPoint, HistoryRange } from "./types";

const SEP = ";";

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV pt-PT (separador `;`, BOM) com uma linha por bucket. */
export function historyToCsv(points: HistoryPoint[], grain: HistoryGrain): string {
  const slugs = CHANNELS.map((c) => c.slug);
  const headers = ["datetime_lisboa", "datetime_utc", ...CHANNELS.map((c) => c.name), "total"];
  const lines = [headers.map(csvCell).join(SEP)];

  for (const p of points) {
    const vals = slugs.map((slug) => Math.round(Number(p.people[slug] ?? 0)));
    const total = vals.reduce((n, v) => n + v, 0);
    lines.push(
      [
        csvCell(formatLisbonCsv(p.bucket, grain)),
        csvCell(p.bucket),
        ...vals.map(csvCell),
        csvCell(total),
      ].join(SEP)
    );
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export function csvFilename(range: HistoryRange, grain: HistoryGrain, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 10);
  return `chartbeat-diretos-${range}-${grainFileSlug(grain)}-${stamp}.csv`;
}
