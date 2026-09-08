"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumberPt, isFlatDelta } from "@lib/pt26/format";
import { initialsOf } from "@lib/pt26/normalize";

export function Logo({ year, className, onClick }: { year: string; className?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="w">
        PORT<span className="u">U</span>GAL
      </span>
      <b>{year}</b>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`logo ${className ?? ""}`} onClick={onClick} aria-label="Início">
        {inner}
      </button>
    );
  }
  return <span className={`logo ${className ?? ""}`}>{inner}</span>;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Número que conta de 0 até ao valor em ~0,8 s (ease-out cúbico); salta direto com reduced-motion. */
export function Count({ value, decimals, unit = "%" }: { value: number; decimals: number; unit?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const D = 800;
    let t0: number | null = null;
    const tick = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min(1, (t - t0) / D);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(value * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, reduced]);
  return (
    <>
      <span className="cnt">{formatNumberPt(shown, decimals)}</span>
      {unit ? <small>{unit}</small> : null}
    </>
  );
}

/** Barra que cresce até `pct` (0–100) depois do primeiro frame (transição CSS de 0,9 s). */
export function Bar({ pct, color, className }: { pct: number; color?: string; className?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(Math.max(0, Math.min(100, pct)))));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className={`bar ${className ?? ""}`}>
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Segmento de uma barra empilhada (SIM / NÃO / NS-NR). */
export function StackSegment({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(Math.max(0, pct))));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return <i style={{ width: `${w}%`, background: color }} />;
}

/** Variação face à semana anterior: null → "primeira semana"; ≈0 → "= semana anterior"; ▲/▼ caso contrário. */
export function Delta({ delta, decimals, className }: { delta: number | null; decimals: number; className?: string }) {
  const base = `delta ${className ?? ""}`;
  if (delta === null) return <div className={base}>primeira semana</div>;
  if (isFlatDelta(delta, decimals)) return <div className={base}>= semana anterior</div>;
  return (
    <div className={`${base} ${delta > 0 ? "up" : "dn"}`}>
      {delta > 0 ? "▲" : "▼"} {formatNumberPt(Math.abs(delta), decimals)} vs semana anterior
    </div>
  );
}

/** Avatar circular: fotografia → logótipo → iniciais / texto de recurso, com a cor do partido no contorno. */
export function Avatar({
  name,
  color,
  size,
  photo,
  logo,
  fallback,
}: {
  name: string | null;
  color?: string;
  size: number;
  photo?: string | null;
  logo?: string | null;
  fallback?: string;
}) {
  const style = { "--av": `${size}px`, "--c": color ?? "rgba(255,255,255,.28)" } as React.CSSProperties;
  return (
    <div className="avatar" style={style}>
      {photo ? (
        <img src={photo} alt={name ?? ""} draggable={false} />
      ) : logo ? (
        <img src={logo} alt={name ?? ""} className="logo-img" draggable={false} />
      ) : (
        (name ? initialsOf(name) : fallback) ?? ""
      )}
    </div>
  );
}
