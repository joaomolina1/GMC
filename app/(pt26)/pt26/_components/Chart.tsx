"use client";

import { formatNumberPt } from "@lib/pt26/format";
import type { History } from "@lib/pt26/history";

const W = 1000;
const H = 430;
const L = 56;
const R = 150;
const T = 28;
const B = 52;

/** Gráfico de linhas SVG feito à mão (como no protótipo): grelha, eixos, linhas a desenhar, valores finais. */
export function HistoryChart({ history, currentLabel }: { history: History; currentLabel: string }) {
  const { weeks, series } = history;
  const n = weeks.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (n === 0 || all.length === 0) {
    return (
      <div className="chart">
        <div className="top">
          <div className="cap">Sem histórico para este quadro.</div>
        </div>
      </div>
    );
  }
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = Math.max((hi - lo) * 0.18, 2);
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  const x = (i: number) => (n === 1 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));

  const ends = series
    .map((s) => {
      const last = s.values[n - 1];
      return last === null ? null : { s, v: last, y: y(last) };
    })
    .filter((e): e is { s: History["series"][number]; v: number; y: number } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 24) ends[i].y = ends[i - 1].y + 24;

  return (
    <div className="chart">
      <div className="top">
        <div className="cap">
          Evolução até {currentLabel} ({n} {n === 1 ? "semana" : "semanas"})
          {n === 1 && <span className="note"> · primeira semana — o histórico começa aqui</span>}
        </div>
        <div className="legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Histórico">
        {[0, 1, 2, 3, 4].map((t) => {
          const v = lo + ((hi - lo) * t) / 4;
          const yy = y(v);
          return (
            <g key={t}>
              <line className="grid" x1={L} x2={W - R + 20} y1={yy} y2={yy} />
              <text className="ax" x={L - 10} y={yy + 5} textAnchor="end">
                {formatNumberPt(v, 0)}
              </text>
            </g>
          );
        })}
        {weeks.map((w, i) => (
          <text key={w.id} className={`ax ${i === n - 1 ? "cur" : ""}`} x={x(i)} y={H - 14} textAnchor="middle">
            {w.shortDate}
          </text>
        ))}
        <line className="curline" x1={x(n - 1)} x2={x(n - 1)} y1={T} y2={H - B + 6} />
        {series.map((s) => {
          let d = "";
          let pen = false;
          s.values.forEach((v, i) => {
            if (v === null) {
              pen = false;
              return;
            }
            d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
            pen = true;
          });
          return (
            <g key={s.label}>
              {d && <path className="line" pathLength={1} d={d.trim()} stroke={s.color} />}
              {s.values.map((v, i) =>
                v === null ? null : <circle key={i} className="pt" cx={x(i)} cy={y(v)} r={i === n - 1 ? 8 : 5} fill={s.color} stroke="#0a1a4c" strokeWidth={3} />
              )}
            </g>
          );
        })}
        {ends.map((e) => (
          <text key={e.s.label} className="end" x={x(n - 1) + 22} y={e.y + 8} fill={e.s.color}>
            {formatNumberPt(e.v, e.s.decimals)}
            {e.s.unit}
          </text>
        ))}
      </svg>
    </div>
  );
}
