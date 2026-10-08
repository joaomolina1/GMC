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
  historySpec,
} from "@lib/chartbeat/format";
import type { HistoryGrain, HistoryPayload, HistoryPoint, HistoryRange, Snapshot, SourceKind } from "@lib/chartbeat/types";
import type { LivePayload } from "@lib/chartbeat/payload";
import {
  finestReadableGrain,
  grainFits,
  grainLimitLabel,
  lisbonFields,
  parseLisbonFields,
} from "@lib/chartbeat/window";
import { CHART_POINT_BUDGET } from "@lib/chartbeat/decimate";
import { AudienceChart } from "./AudienceChart";
import { ChannelComposition } from "./ChannelComposition";

export function ChartbeatDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [live, setLive] = useState<LivePayload | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [range, setRange] = useState<HistoryRange>("24h");
  const [grain, setGrain] = useState<HistoryGrain>("minute");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("00:00");
  const [datesDirty, setDatesDirty] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverPoint, setHoverPoint] = useState<HistoryPoint | null>(null);
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

  const loadHistory = useCallback(async (r: HistoryRange, g: HistoryGrain, fromIso?: string | null, toIso?: string | null) => {
    const q = new URLSearchParams({ range: r, grain: g });
    if (r === "custom" && fromIso && toIso) {
      q.set("from", fromIso);
      q.set("to", toIso);
    }
    const res = await fetch(`/api/chartbeat/history?${q}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Falha a ler o histórico");
    setHistory(data as HistoryPayload);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadLive(), loadHistory(range, grain, customFrom, customTo)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [loadLive, loadHistory, range, grain, customFrom, customTo]);

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
    setHoverPoint(null);
    setHistoryLoading(true);
    loadHistory(range, grain, customFrom, customTo)
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
  }, [range, grain, customFrom, customTo, loadHistory]);

  useEffect(() => {
    if (!history || fromDate) return;
    const from = lisbonFields(new Date(history.from));
    const to = lisbonFields(new Date(history.to));
    setFromDate(from.date);
    setFromTime(from.time);
    setToDate(to.date);
    setToTime(to.time);
  }, [history, fromDate]);

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

  function pickRange(next: Exclude<HistoryRange, "custom">) {
    const spec = historySpec(next);
    const to = new Date();
    const from = new Date(to.getTime() - spec.ms);
    const a = lisbonFields(from);
    const b = lisbonFields(to);
    setFromDate(a.date);
    setFromTime(a.time);
    setToDate(b.date);
    setToTime(b.time);
    setRange(next);
    setCustomFrom(null);
    setCustomTo(null);
    setGrain(defaultGrain(next));
    setDatesDirty(false);
    setHoverPoint(null);
    setError(null);
  }

  function applyDates() {
    const from = parseLisbonFields(fromDate, fromTime);
    const to = parseLisbonFields(toDate, toTime);
    if (!from || !to) {
      setError("Datas inválidas.");
      return;
    }
    if (to.getTime() <= from.getTime()) {
      setError("A data de fim tem de ser depois da de início.");
      return;
    }
    const span = to.getTime() - from.getTime();
    const nextGrain = finestReadableGrain(span, grain);
    setError(null);
    setDatesDirty(false);
    setHoverPoint(null);
    setGrain(nextGrain);
    setCustomFrom(from.toISOString());
    setCustomTo(to.toISOString());
    setRange("custom");
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
  const spanMs =
    range === "custom" && customFrom && customTo
      ? new Date(customTo).getTime() - new Date(customFrom).getTime()
      : historySpec(range).ms;

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
                {ch?.mix?.playing != null && (
                  <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                    {formatPeople(ch.mix.playing)} a reproduzir
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
              {history && history.points.length > CHART_POINT_BUDGET
                ? "Linha com picos e vales, para se ler de uma vez. O CSV traz cada ponto."
                : grainMeta.hint}
              {history
                ? ` · ${formatLisbonDateTime(history.from)} – ${formatLisbonDateTime(history.to)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              items={HISTORY_RANGES.map((r) => ({ id: r.id, label: r.label }))}
              value={range}
              onChange={(id) => pickRange(id as Exclude<HistoryRange, "custom">)}
            />
            <Segmented
              items={HISTORY_GRAINS.map((g) => ({
                id: g.id,
                label: g.short,
                disabled: !grainFits(spanMs, g.id),
                title: grainFits(spanMs, g.id) ? undefined : `Só até ${grainLimitLabel(g.id)}`,
              }))}
              value={grain}
              onChange={(id) => {
                const next = id as HistoryGrain;
                if (!grainFits(spanMs, next)) return;
                setGrain(next);
                setHoverPoint(null);
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

        <div className="flex flex-wrap items-end gap-2 border-b border-white/10 px-5 py-3">
          <DateField
            label="De"
            date={fromDate}
            time={fromTime}
            onDate={(value) => {
              setFromDate(value);
              setDatesDirty(true);
            }}
            onTime={(value) => {
              setFromTime(value);
              setDatesDirty(true);
            }}
          />
          <DateField
            label="Até"
            date={toDate}
            time={toTime}
            onDate={(value) => {
              setToDate(value);
              setDatesDirty(true);
            }}
            onTime={(value) => {
              setToTime(value);
              setDatesDirty(true);
            }}
          />
          <button
            type="button"
            onClick={applyDates}
            className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium ring-1 ring-inset ${
              datesDirty
                ? "bg-white text-slate-900 ring-white"
                : "bg-white/10 text-white ring-white/15 hover:bg-white/15"
            }`}
          >
            Aplicar datas
          </button>
          {!grainFits(spanMs, "minute") && (
            <p className="text-[11px] text-slate-400">
              Ao minuto só até 36 horas. Encurta as datas para ver cada ponto.
            </p>
          )}
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
          <AudienceChart history={history} hidden={hidden} onHoverPoint={setHoverPoint} />
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

      {openSlug && CHANNEL_BY_SLUG[openSlug] && (
        <ChannelComposition
          name={CHANNEL_BY_SLUG[openSlug].name}
          color={CHANNEL_BY_SLUG[openSlug].color}
          mix={
            hoverPoint?.mix?.[openSlug] ??
            snapshot?.channels.find((c) => c.slug === openSlug)?.mix ??
            null
          }
          at={hoverPoint?.mix?.[openSlug] ? hoverPoint.bucket : captured}
        />
      )}

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
  items: { id: string; label: string; disabled?: boolean; title?: string }[];
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
            title={item.title}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
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

function DateField({
  label,
  date,
  time,
  onDate,
  onTime,
}: {
  label: string;
  date: string;
  time: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
}) {
  const field =
    "h-8 rounded-md border-0 bg-white/10 px-2 text-xs text-white ring-1 ring-inset ring-white/15 [color-scheme:dark] focus:outline-none focus:ring-white/40";
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
      {label}
      <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className={field} />
      <input type="time" value={time} onChange={(e) => onTime(e.target.value)} className={field} />
    </label>
  );
}

function KindBadge({ kind, host }: { kind: SourceKind; host: string }) {
  const label = kind === "app" ? "App" : host.replace(".iol.pt", "");
  return <Badge tone={kind === "app" ? "warning" : "neutral"}>{label}</Badge>;
}
