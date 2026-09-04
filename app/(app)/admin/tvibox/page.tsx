"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Plus, RefreshCw, Upload, ExternalLink, Trash2, Film, Image as ImageIcon, Captions } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Input, Select, Textarea } from "@/_design_system/Input";
import { createClient } from "@lib/supabase/client";

interface SeriesRow {
  id: string;
  slug: string;
  title: string;
  genre: string;
  tagline: string | null;
  synopsis: string | null;
  badge: "hot" | "new" | null;
  palette: { from: string; to: string };
  poster_url: string | null;
  total_episodes: number;
  sort_order: number;
  cast_notes: { name: string; role: string }[];
}

interface EpisodeRow {
  id: string;
  series_id: string;
  number: number;
  title: string;
  synopsis: string | null;
  hook_title: string | null;
  hook_text: string | null;
  is_free: boolean;
  coin_cost: number;
  duration_seconds: number | null;
  video_url: string | null;
  poster_url: string | null;
  subtitles_url: string | null;
  render_kind: "none" | "animatic" | "final";
  status: "draft" | "published" | "coming_soon";
  published_at: string | null;
}

type SeriesForm = Omit<SeriesRow, "id" | "cast_notes"> & { id?: string };
type EpisodeForm = Omit<EpisodeRow, "id" | "published_at" | "render_kind"> & { id?: string; render_kind?: EpisodeRow["render_kind"] };

const STATUS_LABEL: Record<EpisodeRow["status"], { label: string; tone: "neutral" | "success" | "warning" }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  coming_soon: { label: "Em breve (bloqueado)", tone: "warning" },
  published: { label: "Publicado", tone: "success" },
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!res.ok || json.ok === false) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

/** Upload direto browser → Storage (URL assinado pelo servidor), com progresso. */
async function uploadDirect(
  kind: "video" | "poster" | "subtitles" | "series-poster",
  seriesSlug: string,
  number: number | undefined,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const contentType = file.type || (kind === "subtitles" ? "text/vtt" : "application/octet-stream");
  const grant = await api<{ path: string; token: string; publicUrl: string; contentType: string }>("/api/tvibox/admin/upload-url", {
    method: "POST",
    body: JSON.stringify({ kind, seriesSlug, number, contentType, filename: file.name }),
  });
  onProgress?.(5);
  const supabase = createClient();
  const { error } = await supabase.storage.from("tvibox").uploadToSignedUrl(grant.path, grant.token, file, {
    contentType: grant.contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload falhou: ${error.message}`);
  onProgress?.(100);
  return grant.publicUrl;
}

function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

export default function TviBoxStudioPage() {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [seriesForm, setSeriesForm] = useState<SeriesForm | null>(null);
  const [episodeForm, setEpisodeForm] = useState<EpisodeForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const notify = useCallback((kind: "ok" | "err", text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 4500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ series: SeriesRow[]; episodes: EpisodeRow[] }>("/api/tvibox/admin/catalog");
      setSeries(r.series);
      setEpisodes(r.episodes);
      setSelectedId((cur) => cur ?? r.series[0]?.id ?? null);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro a carregar");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => series.find((s) => s.id === selectedId) ?? null, [series, selectedId]);
  const selectedEpisodes = useMemo(
    () => episodes.filter((e) => e.series_id === selectedId).sort((a, b) => a.number - b.number),
    [episodes, selectedId]
  );

  /* ---------------- séries ---------------- */
  function newSeries() {
    setSeriesForm({
      slug: "",
      title: "",
      genre: "Drama",
      tagline: "",
      synopsis: "",
      badge: null,
      palette: { from: "#3a1a24", to: "#100a0c" },
      poster_url: null,
      total_episodes: 40,
      sort_order: (series.at(-1)?.sort_order ?? 0) + 1,
    });
    setEpisodeForm(null);
  }

  function editSeries(s: SeriesRow) {
    setSeriesForm({ ...s, tagline: s.tagline ?? "", synopsis: s.synopsis ?? "" });
    setEpisodeForm(null);
  }

  async function saveSeries() {
    if (!seriesForm) return;
    setBusy("series");
    try {
      const payload = {
        ...seriesForm,
        tagline: seriesForm.tagline || null,
        synopsis: seriesForm.synopsis || null,
        total_episodes: Number(seriesForm.total_episodes),
        sort_order: Number(seriesForm.sort_order),
      };
      const r = await api<{ series: SeriesRow }>("/api/tvibox/admin/series", { method: "POST", body: JSON.stringify(payload) });
      setSeries((prev) => {
        const exists = prev.some((s) => s.id === r.series.id);
        const next = exists ? prev.map((s) => (s.id === r.series.id ? r.series : s)) : [...prev, r.series];
        return next.sort((a, b) => a.sort_order - b.sort_order);
      });
      setSelectedId(r.series.id);
      setSeriesForm(null);
      notify("ok", `Série «${r.series.title}» guardada`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSeries(s: SeriesRow) {
    const eps = episodes.filter((e) => e.series_id === s.id).length;
    if (!window.confirm(`Apagar a série «${s.title}» e os seus ${eps} episódios? Esta ação é irreversível.`)) return;
    setBusy("series-del");
    try {
      await api(`/api/tvibox/admin/series?id=${s.id}&confirm=1`, { method: "DELETE" });
      setSeries((prev) => prev.filter((x) => x.id !== s.id));
      setEpisodes((prev) => prev.filter((e) => e.series_id !== s.id));
      setSelectedId((cur) => (cur === s.id ? null : cur));
      notify("ok", "Série apagada");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function uploadSeriesPoster(s: SeriesRow, file: File) {
    setBusy("series-poster");
    try {
      const url = await uploadDirect("series-poster", s.slug, undefined, file, (p) => setProgress((x) => ({ ...x, "series-poster": p })));
      const r = await api<{ series: SeriesRow }>("/api/tvibox/admin/series", {
        method: "POST",
        body: JSON.stringify({ ...s, poster_url: url }),
      });
      setSeries((prev) => prev.map((x) => (x.id === s.id ? r.series : x)));
      notify("ok", "Poster atualizado");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setBusy(null);
    }
  }

  /* ---------------- episódios ---------------- */
  function newEpisode() {
    if (!selected) return;
    const nextNumber = (selectedEpisodes.at(-1)?.number ?? 0) + 1;
    setEpisodeForm({
      series_id: selected.id,
      number: nextNumber,
      title: "",
      synopsis: "",
      hook_title: "",
      hook_text: "",
      is_free: nextNumber === 1,
      coin_cost: nextNumber === 1 ? 0 : 15,
      status: "coming_soon",
      video_url: null,
      duration_seconds: null,
      poster_url: null,
      subtitles_url: null,
    });
    setSeriesForm(null);
  }

  function editEpisode(e: EpisodeRow) {
    setEpisodeForm({ ...e, synopsis: e.synopsis ?? "", hook_title: e.hook_title ?? "", hook_text: e.hook_text ?? "" });
    setSeriesForm(null);
  }

  async function saveEpisode(override?: Partial<EpisodeForm>) {
    if (!episodeForm) return;
    const form = { ...episodeForm, ...override };
    setBusy("episode");
    try {
      const payload = {
        ...form,
        synopsis: form.synopsis || null,
        hook_title: form.hook_title || null,
        hook_text: form.hook_text || null,
        number: Number(form.number),
        coin_cost: Number(form.coin_cost),
        duration_seconds: form.duration_seconds ? Number(form.duration_seconds) : null,
      };
      const r = await api<{ episode: EpisodeRow }>("/api/tvibox/admin/episodes", { method: "POST", body: JSON.stringify(payload) });
      setEpisodes((prev) => {
        const exists = prev.some((e) => e.id === r.episode.id);
        return exists ? prev.map((e) => (e.id === r.episode.id ? r.episode : e)) : [...prev, r.episode];
      });
      setEpisodeForm(null);
      notify("ok", `EP ${r.episode.number} guardado (${STATUS_LABEL[r.episode.status].label.toLowerCase()})`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function quickStatus(e: EpisodeRow, status: EpisodeRow["status"]) {
    setBusy(`status-${e.id}`);
    try {
      const r = await api<{ episode: EpisodeRow }>("/api/tvibox/admin/episodes", { method: "POST", body: JSON.stringify({ ...e, status }) });
      setEpisodes((prev) => prev.map((x) => (x.id === e.id ? r.episode : x)));
      notify("ok", `EP ${e.number} → ${STATUS_LABEL[status].label}`);
    } catch (err) {
      notify("err", err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function deleteEpisode(e: EpisodeRow) {
    if (!window.confirm(`Apagar o EP ${e.number} «${e.title}»? Os desbloqueios e o progresso dos utilizadores neste episódio são perdidos.`)) return;
    setBusy(`del-${e.id}`);
    try {
      await api(`/api/tvibox/admin/episodes?id=${e.id}`, { method: "DELETE" });
      setEpisodes((prev) => prev.filter((x) => x.id !== e.id));
      notify("ok", "Episódio apagado");
    } catch (err) {
      notify("err", err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function uploadEpisodeMedia(kind: "video" | "poster" | "subtitles", file: File) {
    if (!episodeForm || !selected) return;
    setBusy(`upload-${kind}`);
    try {
      const url = await uploadDirect(kind, selected.slug, Number(episodeForm.number), file, (p) => setProgress((x) => ({ ...x, [kind]: p })));
      const patch: Partial<EpisodeForm> = {};
      if (kind === "video") {
        patch.video_url = url;
        patch.render_kind = "final";
        const d = await probeDuration(file);
        if (d) patch.duration_seconds = d;
      } else if (kind === "poster") patch.poster_url = url;
      else patch.subtitles_url = url;
      setEpisodeForm((f) => (f ? { ...f, ...patch } : f));
      notify("ok", kind === "video" ? "Vídeo carregado — guarda o episódio para publicar" : kind === "poster" ? "Poster carregado" : "Legendas carregadas");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setBusy(null);
    }
  }

  const publishedCount = episodes.filter((e) => e.status === "published").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Estúdio TVI Box</h2>
            <Badge tone="brand">Conteúdos</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Gestão de séries e episódios da zona vertical. Os uploads vão direto para o Storage (bucket <code>tvibox</code>).
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ‹ Backoffice
          </Link>
          <Link href="/tvibox" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink size={16} /> Ver app
          </Link>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar
          </Button>
          <Button onClick={newSeries}>
            <Plus size={16} /> Nova série
          </Button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-slate-400"><Clapperboard size={16} /><span className="text-xs font-medium uppercase tracking-wider">Séries</span></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{series.length}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400"><Film size={16} /><span className="text-xs font-medium uppercase tracking-wider">Episódios publicados</span></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{publishedCount}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400"><Upload size={16} /><span className="text-xs font-medium uppercase tracking-wider">Em breve / rascunho</span></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{episodes.length - publishedCount}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* lista de séries */}
        <Card padding="sm" className="self-start">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Séries (ordem editorial)</p>
          <div className="flex flex-col gap-1">
            {series.map((s) => {
              const count = episodes.filter((e) => e.series_id === s.id).length;
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    setSeriesForm(null);
                    setEpisodeForm(null);
                  }}
                  className={`flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${active ? "bg-brand-50 ring-1 ring-brand-100" : "hover:bg-slate-50"}`}
                >
                  <div
                    className="h-14 w-10 flex-none rounded-md bg-cover bg-center"
                    style={{ backgroundImage: s.poster_url ? `url(${s.poster_url})` : `linear-gradient(155deg, ${s.palette.from}, ${s.palette.to})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{s.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {s.genre} · {count} ep. · #{s.sort_order}
                    </p>
                  </div>
                  {s.badge && <Badge tone={s.badge === "hot" ? "warning" : "brand"}>{s.badge === "hot" ? "Em alta" : "Novo"}</Badge>}
                </button>
              );
            })}
            {!loading && series.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-400">Sem séries. Cria a primeira.</p>}
          </div>
        </Card>

        <div className="space-y-6">
          {/* formulário de série */}
          {seriesForm && (
            <Card>
              <CardHeader>
                <CardTitle>{seriesForm.id ? `Editar série — ${seriesForm.title}` : "Nova série"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSeriesForm(null)}>Cancelar</Button>
              </CardHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Título"
                  value={seriesForm.title}
                  onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value, slug: seriesForm.id ? seriesForm.slug : slugify(e.target.value) })}
                  required
                />
                <Input label="Slug (URL)" value={seriesForm.slug} onChange={(e) => setSeriesForm({ ...seriesForm, slug: slugify(e.target.value) })} hint="Ex.: sangue → /tvibox/ver/sangue" required />
                <Input label="Género" value={seriesForm.genre} onChange={(e) => setSeriesForm({ ...seriesForm, genre: e.target.value })} placeholder="Drama · Romance · Suspense…" />
                <Input label="Tagline" value={seriesForm.tagline ?? ""} onChange={(e) => setSeriesForm({ ...seriesForm, tagline: e.target.value })} placeholder="TVI Box original" />
                <div className="md:col-span-2">
                  <Textarea label="Sinopse" value={seriesForm.synopsis ?? ""} onChange={(e) => setSeriesForm({ ...seriesForm, synopsis: e.target.value })} className="min-h-[90px]" />
                </div>
                <Select label="Selo" value={seriesForm.badge ?? ""} onChange={(e) => setSeriesForm({ ...seriesForm, badge: (e.target.value || null) as SeriesForm["badge"] })}>
                  <option value="">Sem selo</option>
                  <option value="hot">🔥 Em alta</option>
                  <option value="new">Novo</option>
                </Select>
                <Input label="Episódios anunciados" type="number" min={1} value={seriesForm.total_episodes} onChange={(e) => setSeriesForm({ ...seriesForm, total_episodes: Number(e.target.value) })} hint="Aparece como «EP 1/40» na app" />
                <Input label="Ordem no feed" type="number" min={0} value={seriesForm.sort_order} onChange={(e) => setSeriesForm({ ...seriesForm, sort_order: Number(e.target.value) })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Cor (topo)" type="color" value={seriesForm.palette.from} onChange={(e) => setSeriesForm({ ...seriesForm, palette: { ...seriesForm.palette, from: e.target.value } })} />
                  <Input label="Cor (base)" type="color" value={seriesForm.palette.to} onChange={(e) => setSeriesForm({ ...seriesForm, palette: { ...seriesForm.palette, to: e.target.value } })} />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={saveSeries} disabled={busy === "series" || !seriesForm.title || !seriesForm.slug}>
                  {busy === "series" ? "A guardar…" : "Guardar série"}
                </Button>
              </div>
            </Card>
          )}

          {/* série selecionada */}
          {selected && !seriesForm && (
            <Card>
              <div className="flex flex-wrap items-start gap-5">
                <div
                  className="h-40 w-28 flex-none rounded-xl bg-cover bg-center shadow"
                  style={{ backgroundImage: selected.poster_url ? `url(${selected.poster_url})` : `linear-gradient(155deg, ${selected.palette.from}, ${selected.palette.to})` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{selected.title}</h3>
                    <Badge>{selected.genre}</Badge>
                    {selected.badge && <Badge tone={selected.badge === "hot" ? "warning" : "brand"}>{selected.badge === "hot" ? "Em alta" : "Novo"}</Badge>}
                    <Badge tone="neutral">/tvibox/ver/{selected.slug}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{selected.synopsis}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {selectedEpisodes.length} episódios criados · {selected.total_episodes} anunciados · ordem #{selected.sort_order}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => editSeries(selected)}>Editar série</Button>
                    <FileButton
                      label={busy === "series-poster" ? `Poster… ${progress["series-poster"] ?? 0}%` : "Substituir poster"}
                      accept="image/jpeg,image/png,image/webp"
                      icon={<ImageIcon size={14} />}
                      disabled={busy === "series-poster"}
                      onFile={(f) => uploadSeriesPoster(selected, f)}
                    />
                    <Link href={`/tvibox/series/${selected.slug}`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      <ExternalLink size={14} /> Ver na app
                    </Link>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteSeries(selected)} disabled={busy === "series-del"}>
                      <Trash2 size={14} /> Apagar
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* episódios */}
          {selected && (
            <Card>
              <CardHeader>
                <CardTitle>Episódios de {selected.title}</CardTitle>
                <Button size="sm" onClick={newEpisode} disabled={!!episodeForm && !episodeForm.id}>
                  <Plus size={14} /> Novo episódio
                </Button>
              </CardHeader>

              {episodeForm && (
                <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{episodeForm.id ? `Editar EP ${episodeForm.number}` : `Novo episódio — EP ${episodeForm.number}`}</p>
                    <Button variant="ghost" size="sm" onClick={() => setEpisodeForm(null)}>Cancelar</Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Número" type="number" min={1} value={episodeForm.number} onChange={(e) => setEpisodeForm({ ...episodeForm, number: Number(e.target.value) })} />
                    <Input label="Título" value={episodeForm.title} onChange={(e) => setEpisodeForm({ ...episodeForm, title: e.target.value })} required />
                    <div className="md:col-span-2">
                      <Textarea label="Sinopse" value={episodeForm.synopsis ?? ""} onChange={(e) => setEpisodeForm({ ...episodeForm, synopsis: e.target.value })} className="min-h-[70px]" />
                    </div>
                    <Input label="Título do cliffhanger" value={episodeForm.hook_title ?? ""} onChange={(e) => setEpisodeForm({ ...episodeForm, hook_title: e.target.value })} hint="Mostrado no cartão bloqueado" />
                    <Input label="Texto do cliffhanger" value={episodeForm.hook_text ?? ""} onChange={(e) => setEpisodeForm({ ...episodeForm, hook_text: e.target.value })} />
                    <Select label="Estado" value={episodeForm.status} onChange={(e) => setEpisodeForm({ ...episodeForm, status: e.target.value as EpisodeRow["status"] })}>
                      <option value="draft">Rascunho — invisível</option>
                      <option value="coming_soon">Em breve — aparece bloqueado (cliffhanger)</option>
                      <option value="published">Publicado — visível e reproduzível (precisa de vídeo)</option>
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Select label="Acesso" value={episodeForm.is_free ? "free" : "paid"} onChange={(e) => setEpisodeForm({ ...episodeForm, is_free: e.target.value === "free", coin_cost: e.target.value === "free" ? 0 : episodeForm.coin_cost || 15 })}>
                        <option value="free">Grátis</option>
                        <option value="paid">Pago (moedas)</option>
                      </Select>
                      <Input label="Custo 🪙" type="number" min={0} value={episodeForm.coin_cost} disabled={episodeForm.is_free} onChange={(e) => setEpisodeForm({ ...episodeForm, coin_cost: Number(e.target.value) })} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <MediaSlot
                      title="Vídeo 9:16 (MP4)"
                      icon={<Film size={14} />}
                      value={episodeForm.video_url}
                      extra={episodeForm.duration_seconds ? `${episodeForm.duration_seconds} s` : null}
                      accept="video/mp4,video/quicktime,video/webm"
                      busy={busy === "upload-video"}
                      progress={progress.video}
                      onFile={(f) => uploadEpisodeMedia("video", f)}
                      onClear={() => setEpisodeForm({ ...episodeForm, video_url: null, duration_seconds: null })}
                    />
                    <MediaSlot
                      title="Poster do episódio"
                      icon={<ImageIcon size={14} />}
                      value={episodeForm.poster_url}
                      accept="image/jpeg,image/png,image/webp"
                      busy={busy === "upload-poster"}
                      progress={progress.poster}
                      onFile={(f) => uploadEpisodeMedia("poster", f)}
                      onClear={() => setEpisodeForm({ ...episodeForm, poster_url: null })}
                    />
                    <MediaSlot
                      title="Legendas PT (WebVTT)"
                      icon={<Captions size={14} />}
                      value={episodeForm.subtitles_url}
                      accept=".vtt,text/vtt"
                      busy={busy === "upload-subtitles"}
                      progress={progress.subtitles}
                      onFile={(f) => uploadEpisodeMedia("subtitles", f)}
                      onClear={() => setEpisodeForm({ ...episodeForm, subtitles_url: null })}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => saveEpisode({ status: episodeForm.status === "published" ? "published" : episodeForm.status })} disabled={busy === "episode" || !episodeForm.title}>
                      {busy === "episode" ? "A guardar…" : "Guardar"}
                    </Button>
                    <Button onClick={() => saveEpisode({ status: "published" })} disabled={busy === "episode" || !episodeForm.title || !episodeForm.video_url} title={!episodeForm.video_url ? "Carrega o vídeo primeiro" : ""}>
                      Guardar e publicar
                    </Button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-2 pr-3">EP</th>
                      <th className="py-2 pr-3">Título</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2 pr-3">Acesso</th>
                      <th className="py-2 pr-3">Vídeo</th>
                      <th className="py-2 pr-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEpisodes.map((e) => (
                      <tr key={e.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{e.number}</td>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900">{e.title}</p>
                          {e.hook_title && <p className="text-xs text-slate-400">Cliffhanger: {e.hook_title}</p>}
                        </td>
                        <td className="py-2.5 pr-3"><Badge tone={STATUS_LABEL[e.status].tone}>{STATUS_LABEL[e.status].label}</Badge></td>
                        <td className="py-2.5 pr-3 text-slate-600">{e.is_free ? "Grátis" : `🪙 ${e.coin_cost}`}</td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {e.video_url ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              {e.duration_seconds ?? "—"} s · {e.render_kind === "animatic" ? "animatic" : "final"}
                              {e.subtitles_url && " · VTT"}
                            </span>
                          ) : (
                            <span className="text-slate-400">sem vídeo</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-0 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => editEpisode(e)}>Editar</Button>
                            {e.status !== "published" && e.video_url && (
                              <Button variant="outline" size="sm" onClick={() => quickStatus(e, "published")} disabled={busy === `status-${e.id}`}>Publicar</Button>
                            )}
                            {e.status === "published" && (
                              <Button variant="outline" size="sm" onClick={() => quickStatus(e, "coming_soon")} disabled={busy === `status-${e.id}`}>Despublicar</Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteEpisode(e)} disabled={busy === `del-${e.id}`} aria-label="Apagar">
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {selectedEpisodes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">Ainda não há episódios. Cria o EP 1 (grátis) para a série aparecer no feed.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
                <p className="font-semibold text-slate-700">Como funciona a publicação</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li><b>Publicado</b> — reproduzível no player; exige vídeo (9:16, MP4 H.264, ≤ 90 s, ≤ 200 MB).</li>
                  <li><b>Em breve</b> — aparece no player como cartão bloqueado (cliffhanger) com o título/texto acima; quem desbloqueia fica com acesso quando o vídeo chegar.</li>
                  <li><b>Rascunho</b> — invisível para os utilizadores.</li>
                  <li>O EP 1 deve ser grátis; a partir do EP 2 o custo padrão é 15 moedas. A série só entra no feed «Para Ti» quando tem pelo menos um episódio com vídeo.</li>
                  <li>Os renders do pipeline Veo (<code>npm run tvibox:produce</code>) publicam-se aqui automaticamente e podem ser substituídos por upload manual.</li>
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FileButton({
  label,
  accept,
  icon,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={disabled}>
        {icon} {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function MediaSlot({
  title,
  icon,
  value,
  extra,
  accept,
  busy,
  progress,
  onFile,
  onClear,
}: {
  title: string;
  icon: React.ReactNode;
  value: string | null | undefined;
  extra?: string | null;
  accept: string;
  busy: boolean;
  progress?: number;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {icon} {title}
      </p>
      {value ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <a href={value} target="_blank" rel="noreferrer" className="truncate text-xs text-brand-600 underline">
            {value.split("/").pop()}
          </a>
          {extra && <span className="text-xs text-slate-500">{extra}</span>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Nenhum ficheiro</p>
      )}
      <div className="mt-3 flex gap-2">
        <FileButton label={busy ? `A carregar… ${progress ?? 0}%` : value ? "Substituir" : "Carregar"} accept={accept} icon={<Upload size={14} />} disabled={busy} onFile={onFile} />
        {value && (
          <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>Remover</Button>
        )}
      </div>
    </div>
  );
}
