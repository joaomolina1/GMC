"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Download, RefreshCw, Radio } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { CHANNELS, CHANNEL_BY_SLUG } from "@lib/chartbeat/channels";
import { csvFilename, historyToCsv } from "@lib/chartbeat/csv";
import {
  HISTORY_GRAINS,
  HISTORY_RANGES,
  defaultGrain,
  formatLisbonDateTime,
  formatPeople,
} from "@lib/chartbeat/format";
import type { HistoryGrain, HistoryPayload, HistoryRange, Snapshot, SourceKind } from "@lib/chartbeat/types";
import type { LivePayload } from "@lib/chartbeat/payload";
import { AudienceChart } from "./AudienceChart";

export function ChartbeatDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [live, setLive] = useState<LivePayload | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [range, setRange] = useState<HistoryRange>("24h");
  const [grain, setGrain] = useState<HistoryGrain>("minute");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>("tvi");

  const loadLive = useCallback(async () => {
    const res = await fetch("/api/chartbeat/live", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Falha a ler a Chartbeat");
    setLive(data as LivePayload);
  }, []);

  const loadHistory = useCallback(async (r: HistoryRange, g: HistoryGrain) => {
    const res = await fetch(`/api/chartbeat/history?range=${r}&grain=${g}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Falha a ler o histórico");
    setHistory(data as HistoryPayload);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadLive(), loadHistory(range, grain)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [loadLive, loadHistory, range, grain]);

  useEffect(() => {
    void loadLive().catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [loadLive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadLive().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [loadLive]);

  useEffect(() => {
    let cancelled = false;
    setHoverIndex(null);
    setHistoryLoading(true);
    loadHistory(range, grain)
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha a ler o histórico");
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, grain, loadHistory]);

  async function ingest() {
    setIngesting(true);
    try {
      const res = await fetch("/api/chartbeat/ingest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ingest falhou");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest falhou");
    } finally {
      setIngesting(false);
    }
  }

  function pickRange(next: HistoryRange) {
    setRange(next);
    setGrain(defaultGrain(next));
    setHoverIndex(null);
  }

  function downloadCsv() {
    const points = history?.points ?? [];
    if (points.length === 0) return;
    setExporting(true);
    try {
      const csv = historyToCsv(points, grain);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = csvFilename(range, grain);
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const snapshot: Snapshot | null = live?.snapshot ?? null;
  const total = snapshot?.channels.reduce((n, c) => n + c.people, 0) ?? 0;
  const captured = snapshot?.capturedAt;
  const grainMeta = HISTORY_GRAINS.find((g) => g.id === grain)!;
  const pointCount = history?.points.length ?? 0;

  const sources = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.channels
      .flatMap((c) => c.sources.map((s) => ({ ...s, channelName: CHANNEL_BY_SLUG[c.slug]?.name ?? c.slug })))
      .sort((a, b) => b.people - a.people);
  }, [snapshot]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Audiência dos diretos</h2>
            {live?.stale ? (
              <Badge tone="warning">Dados em atraso</Badge>
            ) : snapshot ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Ao vivo
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Pessoas a ver cada linear no TVI Player e na CNN Portugal, minuto a minuto. Vários
            links do mesmo direto (web, app, casing) somam-se no canal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          {isAdmin && (
            <Button onClick={() => void ingest()} disabled={ingesting}>
              <Radio size={16} />
              {ingesting ? "A gravar…" : "Gravar este minuto"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Agora</p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatPeople(total)}
              <span className="ml-2 text-sm font-medium text-slate-400">pessoas em direto</span>
            </p>
          </div>
          {captured && (
            <p className="text-xs text-slate-400">{formatLisbonDateTime(captured)} · Lisboa</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
          {CHANNELS.map((meta) => {
            const ch = snapshot?.channels.find((c) => c.slug === meta.slug);
            const people = ch?.people ?? 0;
            const active = openSlug === meta.slug;
            return (
              <button
                key={meta.slug}
                type="button"
                onClick={() => setOpenSlug(active ? null : meta.slug)}
                className={`px-4 py-4 text-left transition ${
                  active ? "bg-slate-50" : "bg-white hover:bg-slate-50/80"
                }`}
              >
                <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                  {meta.name}
                </span>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {formatPeople(people)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {people ? `${formatPeople(ch?.web ?? 0)} web · ${formatPeople(ch?.app ?? 0)} app` : "sem audiência"}
                </p>
                {ch?.programTitle && (
                  <p className="mt-1 truncate text-xs text-slate-500" title={ch.programTitle}>
                    {ch.programTitle}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0a1018] shadow-[0_24px_60px_-24px_rgba(10,16,24,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-white">Pessoas ao longo do tempo</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Gráfico de linhas independentes · {grainMeta.hint}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              items={HISTORY_RANGES.map((r) => ({ id: r.id, label: r.label }))}
              value={range}
              onChange={(id) => pickRange(id as HistoryRange)}
            />
            <Segmented
              items={HISTORY_GRAINS.map((g) => ({ id: g.id, label: g.short }))}
              value={grain}
              onChange={(id) => {
                setGrain(id as HistoryGrain);
                setHoverIndex(null);
              }}
            />
            <button
              type="button"
              onClick={downloadCsv}
              disabled={exporting || pointCount === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-medium text-white ring-1 ring-inset ring-white/15 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="px-2 pt-2 sm:px-4">
          <div className="mb-2 flex flex-wrap gap-1.5 px-3">
            {CHANNELS.map((c) => {
              const off = hidden.has(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => {
                    const next = new Set(hidden);
                    if (off) next.delete(c.slug);
                    else next.add(c.slug);
                    setHidden(next);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition ${
                    off
                      ? "bg-transparent text-slate-500 ring-white/10"
                      : "bg-white/10 text-slate-100 ring-white/15"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: off ? "#475569" : c.color }} />
                  {c.name}
                </button>
              );
            })}
          </div>
          <AudienceChart history={history} hidden={hidden} hoverIndex={hoverIndex} onHover={setHoverIndex} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-[11px] text-slate-500">
          <p>
            {pointCount > 0
              ? `${formatPeople(pointCount)} ${pointCount === 1 ? "ponto" : "pontos"} · ${grainMeta.label.toLowerCase()}`
              : "À espera do primeiro ponto"}
            {pointCount > 0 && pointCount < 12 && grain === "minute"
              ? " · o cron ainda está a acumular minutos"
              : ""}
            {historyLoading ? " · a carregar…" : ""}
          </p>
          <p>
            {live?.lastIngest
              ? `Último cron ${formatLisbonDateTime(live.lastIngest.capturedAt)} · ${live.lastIngest.status}`
              : "Cron Vercel a cada minuto"}
            {live?.lastIngest?.error ? ` · ${live.lastIngest.error}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>De onde vêm os números</CardTitle>
            <span className="text-xs text-slate-400">{sources.length} páginas Chartbeat neste minuto</span>
          </CardHeader>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Canal</th>
                  <th className="pb-2 font-medium">Origem</th>
                  <th className="pb-2 font-medium">Página</th>
                  <th className="pb-2 text-right font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody>
                {(openSlug ? sources.filter((s) => s.channelSlug === openSlug) : sources).map((s, i) => (
                  <tr key={`${s.path}-${i}`} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: CHANNEL_BY_SLUG[s.channelSlug]?.color }}
                        />
                        {s.channelName}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <KindBadge kind={s.kind} host={s.host} />
                    </td>
                    <td className="max-w-[28rem] py-2 pr-3">
                      <p className="truncate font-medium text-slate-800" title={s.title}>
                        {s.title}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-400" title={s.path}>
                        {s.path}
                      </p>
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatPeople(s.people)}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Sem páginas de direto neste minuto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Não agrupados</CardTitle>
          </CardHeader>
          <p className="mb-3 text-xs text-slate-500">
            Páginas `/direto/…` que ainda não mapeámos para um canal. Se aparecer um linear novo, diz
            e acrescentamos a regra.
          </p>
          <ul className="space-y-2">
            {(snapshot?.unmatched ?? []).map((u) => (
              <li key={u.path} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{u.title}</p>
                  <span className="tabular-nums text-sm font-semibold">{formatPeople(u.people)}</span>
                </div>
                <p className="truncate font-mono text-[11px] text-slate-400">{u.path}</p>
              </li>
            ))}
            {(snapshot?.unmatched.length ?? 0) === 0 && (
              <li className="flex items-center gap-2 text-sm text-slate-400">
                <Activity size={14} /> Tudo o que parece direto está mapeado.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Segmented({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-white/10 p-0.5 ring-1 ring-inset ring-white/10">
      {items.map((item) => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              on ? "bg-white text-slate-900 shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function KindBadge({ kind, host }: { kind: SourceKind; host: string }) {
  const label = kind === "app" ? "App" : host.replace(".iol.pt", "");
  return <Badge tone={kind === "app" ? "warning" : "neutral"}>{label}</Badge>;
}
