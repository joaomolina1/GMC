"use client";

import { useMemo, useState } from "react";
import { CHANNELS } from "@lib/chartbeat/channels";
import { formatLisbon, formatLisbonTime } from "@lib/chartbeat/format";
import type { HistoryPayload, HistoryPoint } from "@lib/chartbeat/types";

function yTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.ceil(raw / mag) * mag;
  const ticks = [0];
  for (let v = step; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

export function AudienceChart({
  history,
  hidden,
  hoverIndex,
  onHover,
}: {
  history: HistoryPayload | null;
  hidden: Set<string>;
  hoverIndex: number | null;
  onHover: (i: number | null) => void;
}) {
  const { points, max, series } = useMemo(() => {
    const pts = history?.points ?? [];
    const visible = CHANNELS.filter((c) => !hidden.has(c.slug));
    let m = 1;
    for (const p of pts) {
      let sum = 0;
      for (const c of visible) sum += Number(p.people[c.slug] ?? 0);
      if (sum > m) m = sum;
    }
    return { points: pts, max: m, series: visible };
  }, [history, hidden]);

  const w = 920;
  const h = 280;
  const pad = { l: 52, r: 16, t: 16, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(points.length, 2);

  const x = (i: number) => pad.l + (i / (n - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  function stackedPath(slug: string, mode: "area" | "line"): string {
    if (points.length === 0) return "";
    const tops: number[] = [];
    const bottoms: number[] = [];
    for (const p of points) {
      let base = 0;
      for (const c of series) {
        if (c.slug === slug) break;
        base += Number(p.people[c.slug] ?? 0);
      }
      const val = Number(p.people[slug] ?? 0);
      bottoms.push(base);
      tops.push(base + val);
    }
    if (mode === "line") {
      return tops.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    }
    const up = tops.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const down = bottoms
      .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .reverse();
    return `${up.join(" ")} ${down.join(" ")} Z`;
  }

  const ticks = yTicks(max);
  const hover = hoverIndex != null && points[hoverIndex] ? points[hoverIndex] : null;

  const timeLabels = useMemo(() => {
    if (points.length === 0) return [];
    const count = 6;
    const idx = Array.from({ length: count }, (_, i) => Math.round((i * (points.length - 1)) / (count - 1)));
    return [...new Set(idx)].map((i) => ({ i, label: labelFor(points[i], history?.range ?? "24h") }));
  }, [points, history?.range]);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[280px] w-full"
        role="img"
        aria-label="Audiência dos diretos ao longo do tempo"
        onMouseLeave={() => onHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#e6ecf3" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400" fontSize="11">
              {t.toLocaleString("pt-PT")}
            </text>
          </g>
        ))}
        {series.map((c) => (
          <path key={`${c.slug}-a`} d={stackedPath(c.slug, "area")} fill={c.color} opacity="0.18" />
        ))}
        {series.map((c) => (
          <path key={`${c.slug}-l`} d={stackedPath(c.slug, "line")} fill="none" stroke={c.color} strokeWidth="2" />
        ))}
        {timeLabels.map(({ i, label }) => (
          <text key={i} x={x(i)} y={h - 10} textAnchor="middle" className="fill-slate-400" fontSize="11">
            {label}
          </text>
        ))}
        {hover && hoverIndex != null && (
          <line
            x1={x(hoverIndex)}
            x2={x(hoverIndex)}
            y1={pad.t}
            y2={h - pad.b}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
        )}
        <rect
          x={pad.l}
          y={pad.t}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg || points.length === 0) return;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const px = (e.clientX - ctm.e) / ctm.a;
            const i = Math.round(((px - pad.l) / innerW) * (n - 1));
            onHover(Math.max(0, Math.min(points.length - 1, i)));
          }}
        />
      </svg>
      {hover && hoverIndex != null && (
        <div className="pointer-events-none absolute right-4 top-2 rounded-xl border border-line bg-white/95 p-3 text-xs shadow-lg">
          <p className="mb-1.5 font-semibold text-slate-700">{labelFor(hover, history?.range ?? "24h", true)}</p>
          {CHANNELS.filter((c) => !hidden.has(c.slug)).map((c) => (
            <div key={c.slug} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </span>
              <span className="tabular-nums font-medium text-slate-900">
                {(hover.people[c.slug] ?? 0).toLocaleString("pt-PT")}
              </span>
            </div>
          ))}
        </div>
      )}
      {points.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Ainda não há histórico. O cron grava um ponto por minuto.
        </p>
      )}
    </div>
  );
}

function labelFor(p: HistoryPoint, range: string, long = false): string {
  if (range === "7d" || range === "30d") {
    return formatLisbon(p.bucket, {
      day: "numeric",
      month: "short",
      ...(long || range === "7d" ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }
  return long ? formatLisbon(p.bucket, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : formatLisbonTime(p.bucket);
}
