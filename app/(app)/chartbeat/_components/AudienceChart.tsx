"use client";

import { memo, useMemo, useRef, useState } from "react";
import { CHANNELS } from "@lib/chartbeat/channels";
import { CHART_POINT_BUDGET, decimateHistory } from "@lib/chartbeat/decimate";
import { formatLisbon, formatLisbonTime, formatPeople } from "@lib/chartbeat/format";
import { lisbonBucketKey, seriesMax } from "@lib/chartbeat/rollup";
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

const W = 1100;
const H = 340;
const PAD = { l: 52, r: 18, t: 18, b: 36 };

const ChartGeometry = memo(function ChartGeometry({
  points,
  series,
  max,
  grain,
  spanMs,
}: {
  points: HistoryPoint[];
  series: { slug: string; color: string }[];
  max: number;
  grain: HistoryGrain;
  spanMs: number;
}) {
  const w = W;
  const h = H;
  const pad = PAD;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(points.length, 2);
  const x = (i: number) => pad.l + (i / (n - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  function linePath(slug: string): string {
    if (points.length === 0) return "";
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const v = Number(points[i]!.people[slug] ?? 0);
      d += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }
    return d;
  }

  const ticks = yTicks(max);
  const timeLabels = useMemo(() => {
    if (points.length === 0) return [];
    const count = spanMs > 36 * 3600_000 ? 7 : 6;
    const idx = Array.from({ length: count }, (_, i) => Math.round((i * (points.length - 1)) / (count - 1)));
    return [...new Set(idx)].map((i) => ({
      i,
      label: labelFor(points[i]!, grain, spanMs, false),
    }));
  }, [points, grain, spanMs]);

  const dayBreaks = useMemo(() => {
    if (grain === "day" || points.length < 2) return [];
    const breaks: { i: number; label: string }[] = [];
    let prev = lisbonBucketKey(points[0]!.bucket, "day");
    for (let i = 1; i < points.length; i++) {
      const key = lisbonBucketKey(points[i]!.bucket, "day");
      if (key !== prev) {
        breaks.push({
          i,
          label: formatLisbon(points[i]!.bucket, { day: "numeric", month: "short" }),
        });
        prev = key;
      }
    }
    return breaks.length > 0 && breaks.length <= 16 ? breaks : [];
  }, [points, grain]);

  return (
    <g>
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
      {dayBreaks.map(({ i, label }) => (
        <g key={`day-${i}`}>
          <line
            x1={x(i)}
            x2={x(i)}
            y1={pad.t}
            y2={h - pad.b}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="2 5"
          />
          <text x={x(i) + 4} y={pad.t + 12} fill="#64748b" fontSize="10">
            {label}
          </text>
        </g>
      ))}
      {series.map((c) => {
        const d = linePath(c.slug);
        if (!d || points.length < 2) return null;
        const last = points.length - 1;
        const area = `${d} L${x(last).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
        return <path key={`${c.slug}-fill`} d={area} fill={c.color} fillOpacity="0.08" />;
      })}
      {series.map((c) => (
        <path
          key={`${c.slug}-line`}
          d={linePath(c.slug)}
          fill="none"
          stroke={c.color}
          strokeWidth="2"
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
      {timeLabels.map(({ i, label }, idx) => {
        const edge = idx === 0 ? "start" : idx === timeLabels.length - 1 ? "end" : "middle";
        const xPos = edge === "start" ? pad.l : edge === "end" ? w - pad.r : x(i);
        return (
          <text key={i} x={xPos} y={h - 10} textAnchor={edge} fill="#8b9cb3" fontSize="11">
            {label}
          </text>
        );
      })}
    </g>
  );
});

export function AudienceChart({
  history,
  hidden,
  onHoverPoint,
}: {
  history: HistoryPayload | null;
  hidden: Set<string>;
  onHoverPoint: (point: HistoryPoint | null) => void;
}) {
  const grain: HistoryGrain = history?.grain ?? "minute";
  const spanMs = history ? new Date(history.to).getTime() - new Date(history.from).getTime() : 0;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const frame = useRef(0);

  const { points, max, series, sourceCount } = useMemo(() => {
    const source = history?.points ?? [];
    const pts = decimateHistory(source, CHART_POINT_BUDGET);
    const visible = CHANNELS.filter((c) => !hidden.has(c.slug));
    return {
      points: pts,
      sourceCount: source.length,
      max: seriesMax(pts, visible.map((c) => c.slug)),
      series: visible,
    };
  }, [history, hidden]);

  const w = W;
  const h = H;
  const pad = PAD;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(points.length, 2);
  const x = (i: number) => pad.l + (i / (n - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const hover = hoverIndex != null ? points[hoverIndex] : undefined;
  const hoverX = hoverIndex != null ? x(hoverIndex) : 0;
  const tooltipOnLeft = hoverX > w * 0.62;
  const simplified = sourceCount > points.length;

  function moveHover(clientX: number, svg: SVGSVGElement) {
    if (points.length === 0) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const px = (clientX - ctm.e) / ctm.a;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - pad.l) / innerW) * (n - 1))));
    if (i === hoverIndex) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setHoverIndex(i);
      onHoverPoint(points[i] ?? null);
    });
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[300px] w-full sm:h-[340px]"
        role="img"
        aria-label="Pessoas a ver cada direto ao longo do tempo"
        onMouseLeave={() => {
          cancelAnimationFrame(frame.current);
          setHoverIndex(null);
          onHoverPoint(null);
        }}
      >
        <ChartGeometry points={points} series={series} max={max} grain={grain} spanMs={spanMs} />
        {hover && hoverIndex != null && (
          <g>
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
          </g>
        )}
        <rect
          x={pad.l}
          y={pad.t}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;
            moveHover(e.clientX, svg);
          }}
        />
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-3 z-10 min-w-[11.5rem] rounded-xl border border-white/10 bg-[#0f1724]/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-sm"
          style={{
            left: tooltipOnLeft ? undefined : hoverX * (100 / w) + "%",
            right: tooltipOnLeft ? `${100 - hoverX * (100 / w)}%` : undefined,
            transform: tooltipOnLeft ? "translateX(8px)" : "translateX(12px)",
          }}
        >
          <p className="mb-2 font-semibold text-slate-100">{labelFor(hover, grain, spanMs, true)}</p>
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
          Ainda não há histórico neste intervalo.
        </p>
      )}
      {simplified && (
        <p className="px-3 pb-1 text-[11px] text-slate-500">
          Linha com {formatPeople(points.length)} pontos (picos e vales). O intervalo tem{" "}
          {formatPeople(sourceCount)}. O CSV traz o detalhe todo.
        </p>
      )}
    </div>
  );
}

function labelFor(p: HistoryPoint, grain: HistoryGrain, spanMs: number, long: boolean): string {
  if (grain === "day") {
    return formatLisbon(p.bucket, {
      weekday: long ? "short" : undefined,
      day: "numeric",
      month: "short",
    });
  }
  if (long || spanMs > 24 * 3600_000) {
    return formatLisbon(p.bucket, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  if (grain === "hour" && !long && spanMs <= 24 * 3600_000) {
    return formatLisbon(p.bucket, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  return long
    ? formatLisbon(p.bucket, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : formatLisbonTime(p.bucket);
}
