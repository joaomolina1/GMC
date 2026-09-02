"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Textarea } from "@/_design_system/Input";
import { cn } from "@lib/utils";
import {
  CLIP_JOB_STEPS,
  type ClipCandidateRow,
  type ClipJobRow,
  type ClipRenderRow,
  type SnapResult,
  type VideoAssetRow,
} from "@lib/clips/types";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  RENDER_STATUS_LABEL,
  SNAP_KIND_LABEL,
  STEP_LABEL,
  formatClock,
  formatDelta,
  formatDuration,
} from "../_lib/labels";

type JobDetail = ClipJobRow & { video_assets: VideoAssetRow | null; candidate_count: number };
type Candidate = ClipCandidateRow & { clip_renders: ClipRenderRow[]; thumbnail_url: string | null };

const JOB_POLL_MS = 4000;
const RENDER_POLL_MS = 5000;

function scoreTone(score: number): "success" | "brand" | "warning" | "neutral" {
  if (score >= 80) return "success";
  if (score >= 60) return "brand";
  if (score >= 40) return "warning";
  return "neutral";
}

export default function ClipJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadJob = useCallback(async () => {
    const res = await fetch(`/api/clips/jobs/${jobId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro ao carregar o job");
    setJob(data);
    return data as JobDetail;
  }, [jobId]);

  const loadCandidates = useCallback(async () => {
    const res = await fetch(`/api/clips/jobs/${jobId}/candidates`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro ao carregar candidatos");
    const list = Array.isArray(data) ? (data as Candidate[]) : [];
    setCandidates(list);
    setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    return list;
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await loadJob();
        if (j.status === "done" || j.candidate_count > 0) await loadCandidates();
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadJob, loadCandidates]);

  const active = job?.status === "queued" || job?.status === "running";
  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      try {
        const j = await loadJob();
        if (j.status === "done") await loadCandidates();
      } catch {
        /* tenta no próximo tick */
      }
    }, JOB_POLL_MS);
    return () => clearInterval(id);
  }, [active, loadJob, loadCandidates]);

  const selected = useMemo(() => candidates.find((c) => c.id === selectedId) ?? null, [candidates, selectedId]);

  function replaceCandidate(updated: Partial<Candidate> & { id: string }) {
    setCandidates((list) => list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  }

  const asset = job?.video_assets ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/clips">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} />
              Clips
            </Button>
          </Link>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-slate-900" title={asset?.filename}>
              {asset?.filename ?? "Vídeo"}
            </h2>
            <p className="text-xs text-slate-500">
              {formatDuration(asset?.duration_sec)}
              {asset?.width && asset?.height ? ` · ${asset.width}×${asset.height}` : ""}
              {asset?.fps ? ` · ${Math.round(asset.fps)} fps` : ""}
            </p>
          </div>
        </div>
        {job && <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>}
      </div>

      {error && (
        <Card className="flex items-center gap-3 border-red-200 bg-red-50 text-sm text-red-700">
          <AlertTriangle size={18} />
          {error}
        </Card>
      )}

      {loading || !job ? (
        <Card className="h-48 animate-pulse" />
      ) : (
        <>
          {job.status !== "done" && <JobProgress job={job} />}

          {candidates.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Candidatos ({candidates.length})
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => void loadCandidates()}>
                    <RefreshCw size={14} />
                    Atualizar
                  </Button>
                </div>
                {candidates.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    selected={c.id === selectedId}
                    onSelect={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start">
                {selected ? (
                  <ReviewPanel
                    key={selected.id}
                    candidate={selected}
                    videoDurationSec={asset?.duration_sec ?? null}
                    onUpdated={replaceCandidate}
                    onRefresh={() => void loadCandidates()}
                  />
                ) : null}
              </div>
            </div>
          )}

          {job.status === "done" && candidates.length === 0 && (
            <Card className="py-12 text-center text-sm text-slate-500">
              O modelo não encontrou candidatos com qualidade suficiente neste vídeo.
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function JobProgress({ job }: { job: JobDetail }) {
  const currentIndex = CLIP_JOB_STEPS.indexOf(job.step);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{job.status === "failed" ? "O processamento falhou" : STEP_LABEL[job.step]}</CardTitle>
        <span className="text-xs text-slate-500">
          {job.progress}% · tentativa {job.attempts}/{job.max_attempts}
        </span>
      </CardHeader>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", job.status === "failed" ? "bg-red-500" : "bg-brand-500")}
          style={{ width: `${Math.max(3, job.progress)}%` }}
        />
      </div>
      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {CLIP_JOB_STEPS.filter((s) => s !== "ready").map((step, i) => {
          const done = i < currentIndex || job.status === "done";
          const current = i === currentIndex && job.status !== "done";
          return (
            <li
              key={step}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
                done && "border-emerald-100 bg-emerald-50 text-emerald-700",
                current && job.status !== "failed" && "border-brand-200 bg-brand-50 text-brand-700",
                current && job.status === "failed" && "border-red-200 bg-red-50 text-red-700",
                !done && !current && "border-line text-slate-400"
              )}
            >
              {done ? (
                <CheckCircle2 size={14} />
              ) : current && job.status === "running" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : current && job.status === "failed" ? (
                <XCircle size={14} />
              ) : (
                <span className="inline-block h-3.5 w-3.5 rounded-full border border-current" />
              )}
              <span className="truncate">{STEP_LABEL[step].replace(/^A /, "")}</span>
            </li>
          );
        })}
      </ol>
      {job.status === "failed" && job.error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {job.error_step ? `${STEP_LABEL[job.error_step]}: ` : ""}
          {job.error}
        </p>
      )}
      {job.status === "queued" && (
        <p className="mt-4 text-xs text-slate-500">
          À espera de um worker. Se ficar em fila muito tempo, confirme que o container do worker está a correr.
        </p>
      )}
    </Card>
  );
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const render = candidate.clip_renders?.[0];
  return (
    <Card
      interactive
      padding="sm"
      onClick={onSelect}
      className={cn("flex gap-3", selected && "border-brand-300 ring-2 ring-brand-500/20")}
    >
      <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {candidate.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Play size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-sm font-semibold text-slate-900">{candidate.title}</h4>
          <Badge tone={scoreTone(candidate.score)}>{candidate.score}</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {formatClock(candidate.in_sec)} → {formatClock(candidate.out_sec)} ·{" "}
          {Math.round(candidate.out_sec - candidate.in_sec)}s
          {candidate.speakers?.length ? ` · ${candidate.speakers.join(", ")}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.status === "approved" && <Badge tone="success">Aprovado</Badge>}
          {candidate.status === "rejected" && <Badge tone="danger">Rejeitado</Badge>}
          {candidate.status === "pending" && <Badge tone="neutral">Por rever</Badge>}
          {render && <Badge tone={render.status === "done" ? "success" : render.status === "failed" ? "danger" : "brand"}>{RENDER_STATUS_LABEL[render.status]}</Badge>}
          {candidate.vision_checked && <Badge tone="neutral">Visão ✓</Badge>}
        </div>
      </div>
    </Card>
  );
}

function ReviewPanel({
  candidate,
  videoDurationSec,
  onUpdated,
  onRefresh,
}: {
  candidate: Candidate;
  videoDurationSec: number | null;
  onUpdated: (c: Partial<Candidate> & { id: string }) => void;
  onRefresh: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [inSec, setInSec] = useState(Number(candidate.in_sec));
  const [outSec, setOutSec] = useState(Number(candidate.out_sec));
  const [lastSnap, setLastSnap] = useState<SnapResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [render, setRender] = useState<ClipRenderRow | null>(candidate.clip_renders?.[0] ?? null);
  const stopAtRef = useRef<number | null>(null);

  const dirty = Math.abs(inSec - Number(candidate.in_sec)) > 1e-3 || Math.abs(outSec - Number(candidate.out_sec)) > 1e-3;
  const pending = candidate.status === "pending";

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clips/candidates/${candidate.id}/preview`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.url) setPreviewUrl(d.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [candidate.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !previewUrl) return;
    const onLoaded = () => {
      v.currentTime = inSec;
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
    // só no primeiro carregamento do URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (stopAtRef.current !== null && v.currentTime >= stopAtRef.current) {
        v.pause();
        stopAtRef.current = null;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [previewUrl]);

  useEffect(() => {
    if (!render || render.status === "done" || render.status === "failed") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/clips/renders/${render.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ClipRenderRow;
      setRender(data);
      if (data.status === "done" || data.status === "failed") onRefresh();
    }, RENDER_POLL_MS);
    return () => clearInterval(id);
  }, [render, onRefresh]);

  function playRange() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = inSec;
    stopAtRef.current = outSec;
    void v.play();
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  }

  const maxT = videoDurationSec ?? Number.POSITIVE_INFINITY;
  const nudgeIn = (d: number) => setInSec((t) => Math.max(0, Math.min(outSec - 0.5, Math.round((t + d) * 100) / 100)));
  const nudgeOut = (d: number) => setOutSec((t) => Math.min(maxT, Math.max(inSec + 0.5, Math.round((t + d) * 100) / 100)));

  async function saveAdjust() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clips/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inSec, outSec }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao guardar");
      const updated = data.candidate as ClipCandidateRow;
      setInSec(Number(updated.in_sec));
      setOutSec(Number(updated.out_sec));
      setLastSnap(data.snap ?? null);
      onUpdated({ id: candidate.id, in_sec: updated.in_sec, out_sec: updated.out_sec, snap_debug: updated.snap_debug });
      setMessage({ tone: "ok", text: "Ajuste guardado." });
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : "Erro" });
    } finally {
      setSaving(false);
    }
  }

  async function decide(decision: "approved" | "rejected") {
    setDeciding(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clips/candidates/${candidate.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: decision === "rejected" ? reason : undefined,
          ...(dirty ? { inSec, outSec } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao registar decisão");
      onUpdated({ id: candidate.id, status: decision, in_sec: data.in_sec, out_sec: data.out_sec });
      setInSec(Number(data.in_sec));
      setOutSec(Number(data.out_sec));
      if (data.snap) setLastSnap(data.snap);
      if (decision === "approved" && data.render_id) {
        setRender({
          id: data.render_id,
          candidate_id: candidate.id,
          status: "queued",
        } as ClipRenderRow);
        setMessage({ tone: "ok", text: "Aprovado. Render em fila — o ficheiro fica disponível quando terminar." });
      } else {
        setMessage({ tone: "ok", text: "Rejeitado. Decisão registada." });
      }
      setRejecting(false);
      onRefresh();
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : "Erro" });
    } finally {
      setDeciding(false);
    }
  }

  async function download() {
    if (!render) return;
    const res = await fetch(`/api/clips/renders/${render.id}/download`, { headers: { accept: "application/json" } });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ tone: "err", text: data.error ?? "Download indisponível" });
      return;
    }
    window.open(data.url, "_blank", "noopener");
  }

  const workerSnap = candidate.snap_debug as (SnapResult & { source?: string }) | null;

  return (
    <Card className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{candidate.title}</h3>
          <Badge tone={scoreTone(candidate.score)}>Score {candidate.score}</Badge>
        </div>
        {candidate.rationale && <p className="mt-1 text-sm text-slate-600">{candidate.rationale}</p>}
        <p className="mt-1 text-[11px] text-slate-400">
          {candidate.model} · {candidate.prompt_id} v{candidate.prompt_version}
          {candidate.window_index !== null ? ` · janela ${candidate.window_index + 1}` : ""}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-black">
        {previewUrl ? (
          <video ref={videoRef} src={previewUrl} controls preload="metadata" className="aspect-video w-full" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-white/60">A obter preview…</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={playRange} disabled={!previewUrl}>
          <Play size={14} />
          Reproduzir intervalo
        </Button>
        <span className="text-xs text-slate-500">
          {formatClock(inSec)} → {formatClock(outSec)} · {(outSec - inSec).toFixed(1)} s
        </span>
      </div>

      {pending && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TimeEditor
            label="Entrada (in)"
            value={inSec}
            onNudge={nudgeIn}
            onSeek={() => seek(inSec)}
            onSetFromPlayer={() => {
              const t = videoRef.current?.currentTime;
              if (t !== undefined) setInSec(Math.max(0, Math.min(outSec - 0.5, Math.round(t * 100) / 100)));
            }}
          />
          <TimeEditor
            label="Saída (out)"
            value={outSec}
            onNudge={nudgeOut}
            onSeek={() => seek(outSec)}
            onSetFromPlayer={() => {
              const t = videoRef.current?.currentTime;
              if (t !== undefined) setOutSec(Math.min(maxT, Math.max(inSec + 0.5, Math.round(t * 100) / 100)));
            }}
          />
        </div>
      )}

      {pending && dirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={saveAdjust} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar ajuste (com snapping)
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setInSec(Number(candidate.in_sec));
              setOutSec(Number(candidate.out_sec));
            }}
          >
            Repor
          </Button>
        </div>
      )}

      {(lastSnap ?? workerSnap) && (
        <SnapInfo snap={(lastSnap ?? workerSnap) as SnapResult} fromEditor={Boolean(lastSnap)} />
      )}

      {candidate.transcript_excerpt && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Transcrição</p>
          <p className="max-h-32 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {candidate.transcript_excerpt}
          </p>
        </div>
      )}

      {candidate.vision_checked && (
        <div className="flex items-start gap-3 rounded-lg border border-line p-3">
          {candidate.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={candidate.thumbnail_url} alt="Thumbnail escolhida" className="h-16 w-28 rounded-md object-cover" />
          )}
          <div className="text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Validação visual</p>
            <p>{candidate.vision_notes || "Sem observações."}</p>
          </div>
        </div>
      )}

      {message && (
        <p
          className={cn(
            "rounded-lg p-3 text-xs",
            message.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          )}
        >
          {message.text}
        </p>
      )}

      {pending ? (
        <div className="space-y-3 border-t border-line pt-4">
          {rejecting ? (
            <div className="space-y-2">
              <Textarea
                label="Motivo da rejeição (obrigatório)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[80px]"
                placeholder="Ex.: momento depende de contexto anterior; áudio sobreposto; sem gancho."
              />
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={() => decide("rejected")} disabled={deciding || !reason.trim()}>
                  <ThumbsDown size={14} />
                  Confirmar rejeição
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={deciding}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide("approved")} disabled={deciding}>
                {deciding ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={16} />}
                Aprovar{dirty ? " com este intervalo" : ""}
              </Button>
              <Button variant="outline" onClick={() => setRejecting(true)} disabled={deciding}>
                <ThumbsDown size={16} />
                Rejeitar
              </Button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            Aprovar cria o render com legendas queimadas. Nenhum ficheiro é gerado sem esta aprovação.
          </p>
        </div>
      ) : (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            {candidate.status === "approved" ? (
              <Badge tone="success">Aprovado</Badge>
            ) : (
              <Badge tone="danger">Rejeitado</Badge>
            )}
            {render && (
              <Badge tone={render.status === "done" ? "success" : render.status === "failed" ? "danger" : "brand"}>
                {render.status === "running" || render.status === "queued" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : null}
                {RENDER_STATUS_LABEL[render.status]}
              </Badge>
            )}
          </div>
          {render?.status === "failed" && render.error && (
            <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{render.error}</p>
          )}
          {render?.status === "done" && (
            <Button onClick={download}>
              <Download size={16} />
              Descarregar MP4
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function TimeEditor({
  label,
  value,
  onNudge,
  onSeek,
  onSetFromPlayer,
}: {
  label: string;
  value: number;
  onNudge: (delta: number) => void;
  onSeek: () => void;
  onSetFromPlayer: () => void;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <button type="button" onClick={onSeek} className="font-mono text-sm text-brand-700 hover:underline" title="Ir para este ponto">
          {formatClock(value)}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {[-1, -0.1, 0.1, 1].map((d) => (
          <Button key={d} size="sm" variant="outline" className="h-7 px-0 text-xs" onClick={() => onNudge(d)}>
            {d > 0 ? "+" : "−"}
            {Math.abs(d)}s
          </Button>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" onClick={onSetFromPlayer}>
        Definir no ponto atual do player
      </Button>
    </div>
  );
}

function SnapInfo({ snap, fromEditor }: { snap: SnapResult; fromEditor: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
      <p className="font-semibold text-slate-700">
        Snapping {fromEditor ? "do último ajuste" : "do worker"}
      </p>
      <p>
        In: {SNAP_KIND_LABEL[snap.snappedIn?.kind] ?? snap.snappedIn?.kind} ({formatDelta(snap.snappedIn?.deltaSec ?? 0)})
        {snap.snappedIn?.shotSec !== undefined ? ` · corte em ${formatClock(snap.snappedIn.shotSec)}` : ""}
      </p>
      <p>
        Out: {SNAP_KIND_LABEL[snap.snappedOut?.kind] ?? snap.snappedOut?.kind} ({formatDelta(snap.snappedOut?.deltaSec ?? 0)})
        {snap.snappedOut?.shotSec !== undefined ? ` · corte em ${formatClock(snap.snappedOut.shotSec)}` : ""}
      </p>
      {snap.clamped && snap.notes?.length > 0 && (
        <p className="mt-1 text-amber-700">{snap.notes.join(" · ")}</p>
      )}
    </div>
  );
}
