"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, PackageOpen, Sparkles, UploadCloud } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input } from "@/_design_system/Input";
import { createClient } from "@lib/supabase/client";
import { getSupabaseEnv } from "@lib/supabase/env";
import type { ImportProposal } from "@lib/tvibox/import";

interface ImportJob {
  id: string;
  status: "uploading" | "queued" | "running" | "review" | "published" | "failed" | "cancelled";
  files: { name: string; size: number; path: string }[];
  hints: { title?: string; slug?: string; publish?: boolean };
  step: string | null;
  progress: number;
  log: string[];
  proposal: ImportProposal | null;
  series_id: string | null;
  error: string | null;
  created_at: string;
}

const STATUS: Record<ImportJob["status"], { label: string; tone: "neutral" | "success" | "warning" | "brand" | "danger" }> = {
  uploading: { label: "A carregar", tone: "neutral" },
  queued: { label: "Em fila", tone: "warning" },
  running: { label: "A processar", tone: "brand" },
  review: { label: "Para rever", tone: "warning" },
  published: { label: "Publicado", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!res.ok || json.ok === false) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

const fmtSize = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} kB`);

/**
 * Importar novela: zip (ou MP4s soltos) → Storage privado (TUS) → job para o worker,
 * que transcodifica, transcreve, pede a ficha editorial ao modelo e cria a série em rascunho.
 */
export function ImportPanel({
  onOpenSeries,
  onChanged,
  notify,
}: {
  onOpenSeries: (seriesId: string) => void;
  /** Chamado quando uma ação altera o catálogo (publicar), para a página recarregar séries/episódios. */
  onChanged?: () => void;
  notify: (kind: "ok" | "err", text: string) => void;
}) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState<{ file: string; pct: number; index: number } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ jobs: ImportJob[] }>("/api/tvibox/admin/imports");
      setJobs(r.jobs);
    } catch {
      /* painel secundário: falha silenciosa, volta a tentar no próximo poll */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = jobs.some((j) => j.status === "queued" || j.status === "running" || j.status === "uploading");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [active, load]);

  async function uploadOne(file: File, objectName: string, endpoint: string, bucket: string, chunkSize: number, onPct: (p: number) => void) {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada. Volta a iniciar sessão.");
    const { anonKey } = getSupabaseEnv();
    await new Promise<void>((resolve, reject) => {
      const up = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${session.access_token}`, apikey: anonKey, "x-upsert": "true" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: bucket, objectName, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
        chunkSize,
        onShouldRetry: (err) => {
          const status = err.originalResponse?.getStatus() ?? 0;
          return status !== 413 && status !== 401 && status !== 403;
        },
        onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
        onProgress: (sent, total) => onPct(total ? Math.round((sent / total) * 100) : 0),
        onSuccess: () => resolve(),
      });
      up.findPreviousUploads()
        .then((prev) => {
          if (prev.length) up.resumeFromPreviousUpload(prev[0]);
          up.start();
        })
        .catch(() => up.start());
    });
  }

  async function start() {
    if (!files.length) return;
    setBusy("upload");
    let jobId: string | null = null;
    try {
      const r = await api<{ job: { id: string; files: { name: string; path: string }[] }; upload: { endpoint: string; bucket: string; chunkSize: number } }>(
        "/api/tvibox/admin/imports",
        { method: "POST", body: JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })), hints: title.trim() ? { title: title.trim() } : {} }) }
      );
      jobId = r.job.id;
      for (const [i, f] of files.entries()) {
        const target = r.job.files[i];
        setUploading({ file: f.name, pct: 0, index: i });
        await uploadOne(f, target.path, r.upload.endpoint, r.upload.bucket, r.upload.chunkSize, (pct) => setUploading({ file: f.name, pct, index: i }));
      }
      await api("/api/tvibox/admin/imports", { method: "PATCH", body: JSON.stringify({ id: r.job.id, action: "uploaded" }) });
      notify("ok", `${files.length} ficheiro(s) carregado(s). O worker trata do resto — acompanha o estado abaixo.`);
      setFiles([]);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Falha no upload";
      const msg = /413|too large|payload/i.test(raw)
        ? "O Storage recusou o zip (HTTP 413 — acima do limite global de tamanho). Sobe o «Global file size limit» nas Definições do Storage do projeto, ou importa com `npm run tvibox:import -- --zip`."
        : raw;
      if (jobId) {
        await api("/api/tvibox/admin/imports", { method: "PATCH", body: JSON.stringify({ id: jobId, action: "fail", error: msg }) }).catch(() => undefined);
      }
      notify("err", msg);
      await load();
    } finally {
      setUploading(null);
      setBusy(null);
    }
  }

  async function act(job: ImportJob, action: "publish" | "cancel" | "retry") {
    if (action === "publish" && !window.confirm(`Publicar todos os episódios de «${job.proposal?.series.title ?? "série"}»? O EP 1 fica grátis; os restantes a 15 moedas.`)) return;
    setBusy(`${action}-${job.id}`);
    try {
      await api("/api/tvibox/admin/imports", { method: "PATCH", body: JSON.stringify({ id: job.id, action }) });
      notify("ok", action === "publish" ? "Série publicada" : action === "cancel" ? "Importação cancelada" : "Job de volta à fila");
      await load();
      if (action === "publish") onChanged?.();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  const totalSize = files.reduce((n, f) => n + f.size, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <PackageOpen size={18} className="text-brand-600" /> Importar novela
          </span>
        </CardTitle>
        <Badge tone="brand">IA</Badge>
      </CardHeader>
      <p className="text-sm text-slate-500">
        Carrega um <b>zip com os episódios</b> (ou os MP4s soltos). O sistema deteta a ordem pelo nome dos ficheiros, converte o vídeo para o formato do
        player, transcreve o áudio e propõe título, sinopse, gancho, poster e legendas de cada episódio — a série fica em <b>rascunho</b> para reveres e
        publicares aqui.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 hover:border-brand-300 hover:bg-brand-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <UploadCloud size={26} className="text-slate-400" />
          {files.length ? (
            <span>
              <b className="text-slate-800">{files.length} ficheiro(s)</b> · {fmtSize(totalSize)}
              <span className="block text-xs text-slate-400">{files.slice(0, 3).map((f) => f.name).join(" · ")}{files.length > 3 ? " …" : ""}</span>
            </span>
          ) : (
            <span>
              Arrasta o zip ou os vídeos para aqui, ou <u>escolhe no computador</u>
              <span className="block text-xs text-slate-400">.zip · .mp4 · .mov — até vários GB (upload direto para o Storage, retomável)</span>
            </span>
          )}
          <input ref={inputRef} type="file" multiple accept=".zip,application/zip,video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <div className="flex flex-col gap-3">
          <Input label="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deduzido dos ficheiros se ficar vazio" />
          <Button onClick={start} disabled={!files.length || !!busy}>
            {busy === "upload" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy === "upload" ? "A carregar…" : "Importar e preencher com IA"}
          </Button>
          {uploading && (
            <div className="text-xs text-slate-500">
              <div className="truncate">
                {uploading.index + 1}/{files.length} · {uploading.file}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${uploading.pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Importações</p>
          {jobs.map((job) => {
            const st = STATUS[job.status];
            const isOpen = open[job.id] ?? (job.status === "running" || job.status === "review" || job.status === "failed");
            const name = job.proposal?.series.title ?? job.hints.title ?? job.files[0]?.name ?? "Importação";
            return (
              <div key={job.id} className="rounded-xl border border-slate-200 bg-white">
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen((o) => ({ ...o, [job.id]: !isOpen }))}>
                  {job.status === "running" || job.status === "queued" ? (
                    <Loader2 size={16} className="flex-none animate-spin text-brand-600" />
                  ) : job.status === "failed" ? (
                    <AlertTriangle size={16} className="flex-none text-red-500" />
                  ) : job.status === "published" ? (
                    <CheckCircle2 size={16} className="flex-none text-emerald-500" />
                  ) : (
                    <PackageOpen size={16} className="flex-none text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {job.files.length} ficheiro(s) · {fmtSize(job.files.reduce((n, f) => n + (f.size ?? 0), 0))} · {new Date(job.created_at).toLocaleString("pt-PT")}
                      {job.step && job.status === "running" ? ` · ${job.step}` : ""}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {(job.status === "running" || job.status === "queued") && (
                  <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-brand-500 transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                )}
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 py-3 text-sm">
                    {job.status === "queued" && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        À espera do worker. Para processar agora: <code>npm run tvibox:import -- --job {job.id}</code>
                      </p>
                    )}
                    {job.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{job.error}</p>}
                    {job.proposal && (
                      <div className="mt-2 space-y-2">
                        <p className="text-slate-700">
                          <b>{job.proposal.series.title}</b> · {job.proposal.series.genre} · {job.proposal.episodes.length} episódios
                        </p>
                        <p className="text-xs leading-relaxed text-slate-500">{job.proposal.series.synopsis}</p>
                        <ul className="grid gap-1 text-xs text-slate-600 md:grid-cols-2">
                          {job.proposal.episodes.slice(0, 6).map((e) => (
                            <li key={e.number} className="truncate">
                              <b>EP {e.number}</b> {e.title}
                              {e.confidence === "low" && <span className="ml-1 text-amber-600">· rever</span>}
                            </li>
                          ))}
                          {job.proposal.episodes.length > 6 && <li className="text-slate-400">… e mais {job.proposal.episodes.length - 6}</li>}
                        </ul>
                        {job.proposal.warnings.length > 0 && (
                          <ul className="text-xs text-amber-700">
                            {job.proposal.warnings.map((w, i) => (
                              <li key={i}>⚠ {w}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.series_id && (
                        <Button variant="outline" size="sm" onClick={() => onOpenSeries(job.series_id as string)}>
                          Abrir série no Estúdio
                        </Button>
                      )}
                      {job.status === "review" && (
                        <Button size="sm" onClick={() => act(job, "publish")} disabled={busy === `publish-${job.id}`}>
                          Publicar todos os episódios
                        </Button>
                      )}
                      {job.status === "failed" && (
                        <Button variant="outline" size="sm" onClick={() => act(job, "retry")} disabled={busy === `retry-${job.id}`}>
                          Voltar à fila
                        </Button>
                      )}
                      {["uploading", "queued", "failed"].includes(job.status) && (
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => act(job, "cancel")} disabled={busy === `cancel-${job.id}`}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                    {job.log.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-slate-400">Registo ({job.log.length})</summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200">{job.log.slice(-60).join("\n")}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
