import { CHANNELS } from "./channels";
import { formatLisbonCsv, grainFileSlug } from "./format";
import type { ChannelMix, HistoryGrain, HistoryPoint, HistoryRange } from "./types";

const MIX_COLUMNS: { key: keyof ChannelMix; header: string }[] = [
  { key: "search", header: "pesquisa" },
  { key: "social", header: "social" },
  { key: "internal", header: "interno" },
  { key: "direct", header: "direto" },
  { key: "links", header: "links" },
  { key: "new", header: "novos" },
  { key: "returning", header: "a voltar" },
  { key: "loyal", header: "fieis" },
  { key: "mobile", header: "mobile" },
  { key: "desktop", header: "desktop" },
  { key: "tablet", header: "tablet" },
  { key: "engagedSec", header: "engagement_s" },
  { key: "playing", header: "a reproduzir" },
  { key: "paused", header: "em pausa" },
  { key: "unplayed", header: "por começar" },
];

const SEP = ";";

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV pt-PT (separador `;`, BOM) com uma linha por bucket. */
export function historyToCsv(points: HistoryPoint[], grain: HistoryGrain): string {
  const slugs = CHANNELS.map((c) => c.slug);
  const headers = [
    "datetime_lisboa",
    "datetime_utc",
    ...CHANNELS.map((c) => c.name),
    "total",
    ...CHANNELS.flatMap((c) => MIX_COLUMNS.map((col) => `${c.name} ${col.header}`)),
  ];
  const lines = [headers.map(csvCell).join(SEP)];

  for (const p of points) {
    const vals = slugs.map((slug) => Math.round(Number(p.people[slug] ?? 0)));
    const total = vals.reduce((n, v) => n + v, 0);
    const mixCells = slugs.flatMap((slug) => {
      const mix = p.mix?.[slug];
      return MIX_COLUMNS.map((col) => {
        if (!mix) return "";
        const value = mix[col.key];
        return value == null ? "" : csvCell(value);
      });
    });
    lines.push(
      [
        csvCell(formatLisbonCsv(p.bucket, grain)),
        csvCell(p.bucket),
        ...vals.map(csvCell),
        csvCell(total),
        ...mixCells,
      ].join(SEP)
    );
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export function csvFilename(range: HistoryRange, grain: HistoryGrain, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 10);
  return `chartbeat-diretos-${range}-${grainFileSlug(grain)}-${stamp}.csv`;
}
