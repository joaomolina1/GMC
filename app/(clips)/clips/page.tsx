"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Scissors, Film, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { formatBytes } from "@lib/utils";
import type { ClipJobRow, VideoAssetRow } from "@lib/clips/types";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, STEP_LABEL, formatDuration } from "./_lib/labels";

type JobWithAsset = ClipJobRow & { video_assets: VideoAssetRow | null };

const POLL_MS = 5000;

export default function ClipsPage() {
  const [jobs, setJobs] = useState<JobWithAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/clips/jobs", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar jobs");
      setJobs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [hasActive, load]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-500 to-accent-500 p-6 text-white shadow-[var(--shadow-card)] sm:p-8">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge tone="brand" className="bg-white/20 text-white ring-white/30">
              Fase 1 · Arquivo
            </Badge>
            <h2 className="mt-2 text-2xl font-bold">Clips</h2>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              Carregue um programa de arquivo e receba uma fila de candidatos a clip — com título,
              pontuação e justificação — para rever, ajustar e aprovar. Nada é publicado sem aprovação humana.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              className="border-white/40 bg-white/10 text-white hover:bg-white/20"
            >
              <RefreshCw size={16} />
              Atualizar
            </Button>
            <Link href="/clips/novo">
              <Button className="bg-white text-brand-700 hover:bg-white/90">
                <Plus size={16} />
                Novo vídeo
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <Card className="flex items-center gap-3 border-red-200 bg-red-50 text-sm text-red-700">
          <AlertTriangle size={18} />
          {error}
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <Scissors size={32} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900">Ainda não há vídeos</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Carregue um VOD para gerar a primeira fila de candidatos a clip.
          </p>
          <Link href="/clips/novo">
            <Button className="mt-5">
              <Plus size={16} />
              Carregar vídeo
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => {
            const asset = job.video_assets;
            const active = job.status === "queued" || job.status === "running";
            return (
              <Link key={job.id} href={`/clips/${job.id}`} className="block h-full">
                <Card interactive className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Film size={22} />
                    </div>
                    <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
                  </div>
                  <h3 className="mt-4 truncate font-semibold text-slate-900" title={asset?.filename}>
                    {asset?.filename ?? "Vídeo"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDuration(asset?.duration_sec)}
                    {asset?.size_bytes ? ` · ${formatBytes(asset.size_bytes)}` : ""}
                    {" · "}
                    {new Date(job.created_at).toLocaleString("pt-PT")}
                  </p>

                  <div className="mt-4 flex-1">
                    {active ? (
                      <>
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>{STEP_LABEL[job.step]}</span>
                          <span>{job.progress}%</span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all"
                            style={{ width: `${Math.max(3, job.progress)}%` }}
                          />
                        </div>
                      </>
                    ) : job.status === "failed" ? (
                      <p className="line-clamp-3 text-xs text-red-600" title={job.error ?? ""}>
                        {job.error_step ? `${STEP_LABEL[job.error_step]}: ` : ""}
                        {job.error ?? "Erro desconhecido"}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">Candidatos prontos para revisão.</p>
                    )}
                  </div>

                  <div className="mt-4 border-t border-line pt-3 text-xs text-slate-400">
                    Tentativa {job.attempts}/{job.max_attempts}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
