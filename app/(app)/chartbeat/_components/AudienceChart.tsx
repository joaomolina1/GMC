"use client";

import { useMemo } from "react";
import { CHANNELS } from "@lib/chartbeat/channels";
import { formatLisbon, formatLisbonTime, formatPeople } from "@lib/chartbeat/format";
import { seriesMax } from "@lib/chartbeat/rollup";
import type { HistoryGrain, HistoryPayload, HistoryPoint } from "@lib/chartbeat/types";

function yTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.ceil(raw / mag) * mag;
  const ticks = [0];
  for (let v = step; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

function downsample<T>(items: T[], maxN: number): T[] {
  if (items.length <= maxN) return items;
  const step = (items.length - 1) / (maxN - 1);
  return Array.from({ length: maxN }, (_, i) => items[Math.round(i * step)]!);
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
  const grain: HistoryGrain = history?.grain ?? "minute";
  const { points, max, series } = useMemo(() => {
    const pts = downsample(history?.points ?? [], 1800);
    const visible = CHANNELS.filter((c) => !hidden.has(c.slug));
    return {
      points: pts,
      max: seriesMax(pts, visible.map((c) => c.slug)),
      series: visible,
    };
  }, [history, hidden]);

  const w = 1100;
  const h = 340;
  const pad = { l: 52, r: 18, t: 18, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(points.length, 2);

  const x = (i: number) => pad.l + (i / (n - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  function linePath(slug: string): string {
    if (points.length === 0) return "";
    return points
      .map((p, i) => {
        const v = Number(p.people[slug] ?? 0);
        return `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .join(" ");
  }

  const ticks = yTicks(max);
  const hover = hoverIndex != null && points[hoverIndex] ? points[hoverIndex] : null;

  const timeLabels = useMemo(() => {
    if (points.length === 0) return [];
    const count = 6;
    const idx = Array.from({ length: count }, (_, i) => Math.round((i * (points.length - 1)) / (count - 1)));
    return [...new Set(idx)].map((i) => ({ i, label: labelFor(points[i]!, grain, history?.range ?? "24h") }));
  }, [points, grain, history?.range]);

  const hoverX = hoverIndex != null ? x(hoverIndex) : 0;
  const tooltipOnLeft = hoverX > w * 0.62;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[300px] w-full sm:h-[340px]"
        role="img"
        aria-label="Pessoas a ver cada direto ao longo do tempo"
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          {series.map((c) => (
            <linearGradient key={c.slug} id={`cb-glow-${c.slug}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={c.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fill="#8b9cb3" fontSize="11">
              {t.toLocaleString("pt-PT")}
            </text>
          </g>
        ))}
        {series.map((c) => {
          const d = linePath(c.slug);
          if (!d || points.length < 2) return null;
          const last = points.length - 1;
          const area = `${d} L${x(last).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
          return <path key={`${c.slug}-fill`} d={area} fill={`url(#cb-glow-${c.slug})`} />;
        })}
        {series.map((c) => (
          <path
            key={`${c.slug}-glow`}
            d={linePath(c.slug)}
            fill="none"
            stroke={c.color}
            strokeWidth="6"
            strokeOpacity="0.22"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((c) => (
          <path
            key={`${c.slug}-line`}
            d={linePath(c.slug)}
            fill="none"
            stroke={c.color}
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {points.length > 0 &&
          series.map((c) => {
            const last = points[points.length - 1]!;
            const v = Number(last.people[c.slug] ?? 0);
            return (
              <circle
                key={`${c.slug}-now`}
                cx={x(points.length - 1)}
                cy={y(v)}
                r="3.5"
                fill={c.color}
                stroke="#0a1018"
                strokeWidth="1.5"
              />
            );
          })}
        {timeLabels.map(({ i, label }) => (
          <text key={i} x={x(i)} y={h - 10} textAnchor="middle" fill="#8b9cb3" fontSize="11">
            {label}
          </text>
        ))}
        {hover && hoverIndex != null && (
          <>
            <line
              x1={x(hoverIndex)}
              x2={x(hoverIndex)}
              y1={pad.t}
              y2={h - pad.b}
              stroke="rgba(255,255,255,0.28)"
              strokeDasharray="3 4"
            />
            {series.map((c) => {
              const v = Number(hover.people[c.slug] ?? 0);
              return (
                <circle
                  key={c.slug}
                  cx={x(hoverIndex)}
                  cy={y(v)}
                  r="4.5"
                  fill="#0a1018"
                  stroke={c.color}
                  strokeWidth="2"
                />
              );
            })}
          </>
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
        <div
          className="pointer-events-none absolute top-3 z-10 min-w-[11.5rem] rounded-xl border border-white/10 bg-[#0f1724]/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-sm"
          style={{
            left: tooltipOnLeft ? undefined : hoverX * (100 / w) + "%",
            right: tooltipOnLeft ? `${100 - hoverX * (100 / w)}%` : undefined,
            transform: tooltipOnLeft ? "translateX(8px)" : "translateX(12px)",
          }}
        >
          <p className="mb-2 font-semibold text-slate-100">{labelFor(hover, grain, history?.range ?? "24h", true)}</p>
          {CHANNELS.filter((c) => !hidden.has(c.slug))
            .slice()
            .sort((a, b) => Number(hover.people[b.slug] ?? 0) - Number(hover.people[a.slug] ?? 0))
            .map((c) => (
              <div key={c.slug} className="flex items-center justify-between gap-6 py-0.5">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="tabular-nums font-medium text-white">
                  {formatPeople(hover.people[c.slug] ?? 0)}
                </span>
              </div>
            ))}
        </div>
      )}
      {points.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
          Ainda não há histórico. O cron grava um ponto por minuto — daqui a pouco aparece a linha.
        </p>
      )}
    </div>
  );
}

function labelFor(p: HistoryPoint, grain: HistoryGrain, range: string, long = false): string {
  if (grain === "day") {
    return formatLisbon(p.bucket, { weekday: long ? "short" : undefined, day: "numeric", month: "short" });
  }
  if (grain === "hour") {
    return long
      ? formatLisbon(p.bucket, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      : formatLisbon(p.bucket, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  if (range === "7d" || range === "30d") {
    return formatLisbon(p.bucket, {
      day: "numeric",
      month: "short",
      ...(long || range === "7d" ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
    });
  }
  return long
    ? formatLisbon(p.bucket, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : formatLisbonTime(p.bucket);
}
