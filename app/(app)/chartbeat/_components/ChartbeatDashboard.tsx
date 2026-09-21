"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Radio } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { CHANNELS, CHANNEL_BY_SLUG } from "@lib/chartbeat/channels";
import { HISTORY_RANGES, formatLisbonDateTime, formatPeople } from "@lib/chartbeat/format";
import type { HistoryPayload, HistoryRange, Snapshot, SourceKind } from "@lib/chartbeat/types";
import type { LivePayload } from "@lib/chartbeat/payload";
import { AudienceChart } from "./AudienceChart";

export function ChartbeatDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [live, setLive] = useState<LivePayload | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [range, setRange] = useState<HistoryRange>("24h");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>("tvi");

  const loadLive = useCallback(async () => {
    const res = await fetch("/api/chartbeat/live", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Falha a ler a Chartbeat");
    setLive(data as LivePayload);
  }, []);

  const loadHistory = useCallback(async (r: HistoryRange) => {
    const res = await fetch(`/api/chartbeat/history?range=${r}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Falha a ler o histórico");
    setHistory(data as HistoryPayload);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadLive(), loadHistory(range)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [loadLive, loadHistory, range]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadLive().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [loadLive]);

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

  const snapshot: Snapshot | null = live?.snapshot ?? null;
  const total = snapshot?.channels.reduce((n, c) => n + c.people, 0) ?? 0;
  const captured = snapshot?.capturedAt;

  const sources = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.channels
      .flatMap((c) => c.sources.map((s) => ({ ...s, channelName: CHANNEL_BY_SLUG[c.slug]?.name ?? c.slug })))
      .sort((a, b) => b.people - a.people);
  }, [snapshot]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Chartbeat · Diretos</h2>
            <Badge tone="brand">Analytics</Badge>
            {live?.stale && <Badge tone="warning">Dados em atraso</Badge>}
          </div>
          <p className="text-sm text-slate-500">
            Concurrents Chartbeat dos lineares TVI Player e CNN Portugal. Vários links do mesmo
            direto (web, casing, app) somam-se no canal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {captured && (
            <span className="text-xs text-slate-400">
              {formatLisbonDateTime(captured)} · {formatPeople(total)} em direto
            </span>
          )}
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CHANNELS.map((meta) => {
          const ch = snapshot?.channels.find((c) => c.slug === meta.slug);
          const people = ch?.people ?? 0;
          const active = openSlug === meta.slug;
          return (
            <button
              key={meta.slug}
              type="button"
              onClick={() => setOpenSlug(active ? null : meta.slug)}
              className={`rounded-2xl border bg-white p-4 text-left shadow-[var(--shadow-card)] transition ${
                active ? "border-slate-300 ring-2 ring-brand-500/15" : "border-line hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  {meta.name}
                </span>
                <span className="text-[11px] text-slate-400">
                  {people ? `${formatPeople(ch?.web ?? 0)} web · ${formatPeople(ch?.app ?? 0)} app` : "—"}
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                {formatPeople(people)}
              </p>
              {ch?.programTitle && (
                <p className="mt-1 truncate text-xs text-slate-500" title={ch.programTitle}>
                  No ar: {ch.programTitle}
                  {ch.videoWatching != null ? ` · ${formatPeople(ch.videoWatching)} a ver vídeo` : ""}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico ao minuto</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            {HISTORY_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  range === r.id ? "bg-brand-500 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <div className="mb-3 flex flex-wrap gap-2">
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
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                  off ? "bg-slate-50 text-slate-400 ring-slate-200" : "bg-white text-slate-700 ring-slate-200"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: off ? "#cbd5e1" : c.color }} />
                {c.name}
              </button>
            );
          })}
        </div>
        <AudienceChart history={history} hidden={hidden} hoverIndex={hoverIndex} onHover={setHoverIndex} />
        {live?.lastIngest && (
          <p className="mt-2 text-xs text-slate-400">
            Último cron: {formatLisbonDateTime(live.lastIngest.capturedAt)} · {live.lastIngest.status}
            {live.lastIngest.error ? ` · ${live.lastIngest.error}` : ""}
          </p>
        )}
      </Card>

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

function KindBadge({ kind, host }: { kind: SourceKind; host: string }) {
  const label = kind === "app" ? "App" : host.replace(".iol.pt", "");
  return <Badge tone={kind === "app" ? "warning" : "neutral"}>{label}</Badge>;
}
