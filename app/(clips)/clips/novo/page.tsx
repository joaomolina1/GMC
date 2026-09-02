"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as tus from "tus-js-client";
import { ArrowLeft, UploadCloud, Film, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input, Textarea } from "@/_design_system/Input";
import { createClient } from "@lib/supabase/client";
import { getSupabaseEnv } from "@lib/supabase/env";
import { formatBytes } from "@lib/utils";
import { CLIPS_ACCEPTED_EXTENSIONS } from "@lib/clips/config";
import { DEFAULT_CLIP_JOB_PARAMS } from "@lib/clips/types";

type Phase = "idle" | "registering" | "uploading" | "queueing" | "done" | "error";

interface UploadTarget {
  asset: { id: string; storage_path: string };
  upload: { endpoint: string; bucket: string; objectName: string; chunkSize: number };
}

export default function NovoClipPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [minDuration, setMinDuration] = useState(DEFAULT_CLIP_JOB_PARAMS.minDurationSec);
  const [maxDuration, setMaxDuration] = useState(DEFAULT_CLIP_JOB_PARAMS.maxDurationSec);
  const [visionCheck, setVisionCheck] = useState(DEFAULT_CLIP_JOB_PARAMS.visionCheck);
  const [programContext, setProgramContext] = useState("");

  const busy = phase === "registering" || phase === "uploading" || phase === "queueing";

  function pickFile(f: File | null) {
    setError(null);
    setProgress(0);
    setPhase("idle");
    setFile(f);
  }

  async function registerAsset(f: File): Promise<UploadTarget> {
    const res = await fetch("/api/clips/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: f.name, mime: f.type || null, sizeBytes: f.size }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao registar o vídeo");
    return data as UploadTarget;
  }

  /** Upload direto browser → Supabase Storage (TUS resumable). Nunca passa pela API da Vercel. */
  function uploadDirect(f: File, target: UploadTarget): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        reject(new Error("Sessão expirada. Volte a iniciar sessão."));
        return;
      }
      const { anonKey } = getSupabaseEnv();

      const upload = new tus.Upload(f, {
        endpoint: target.upload.endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: target.upload.bucket,
          objectName: target.upload.objectName,
          contentType: f.type || "video/mp4",
          cacheControl: "3600",
        },
        chunkSize: target.upload.chunkSize,
        onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
        onProgress: (uploaded, total) => setProgress(total > 0 ? Math.round((uploaded / total) * 100) : 0),
        onSuccess: () => resolve(),
      });
      uploadRef.current = upload;

      const previous = await upload.findPreviousUploads();
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  }

  async function createJob(assetId: string): Promise<string> {
    const res = await fetch("/api/clips/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoAssetId: assetId,
        params: {
          minDurationSec: minDuration,
          maxDurationSec: maxDuration,
          visionCheck,
          programContext: programContext.trim() || undefined,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao criar o job");
    return data.id as string;
  }

  async function start() {
    if (!file || busy) return;
    setError(null);
    try {
      setPhase("registering");
      const target = await registerAsset(file);
      setPhase("uploading");
      await uploadDirect(file, target);
      setPhase("queueing");
      const jobId = await createJob(target.asset.id);
      setPhase("done");
      router.push(`/clips/${jobId}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Erro inesperado");
    }
  }

  function abort() {
    uploadRef.current?.abort(true).catch(() => undefined);
    uploadRef.current = null;
    setPhase("idle");
    setProgress(0);
  }

  const accept = CLIPS_ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clips">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
            Clips
          </Button>
        </Link>
        <h2 className="text-xl font-semibold text-slate-900">Novo vídeo</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Ficheiro</CardTitle>
          <span className="text-xs text-slate-400">Upload direto para o Storage (resumable)</span>
        </CardHeader>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />

        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
              <UploadCloud size={28} />
            </div>
            <div>
              <p className="font-medium text-slate-800">Escolher ficheiro de vídeo</p>
              <p className="mt-1 text-xs text-slate-500">{CLIPS_ACCEPTED_EXTENSIONS.join(", ")}</p>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-4 rounded-xl border border-line bg-slate-50/60 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Film size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)}
                {file.type ? ` · ${file.type}` : ""}
              </p>
              {(phase === "uploading" || phase === "queueing" || phase === "done") && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>
                      {phase === "uploading" ? "A carregar…" : phase === "queueing" ? "A criar job…" : "Concluído"}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </div>
            {!busy && (
              <Button variant="ghost" size="sm" onClick={() => pickFile(null)}>
                Trocar
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Parâmetros</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Duração mínima do clip (s)"
            type="number"
            min={3}
            max={600}
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            disabled={busy}
          />
          <Input
            label="Duração máxima do clip (s)"
            type="number"
            min={5}
            max={900}
            value={maxDuration}
            onChange={(e) => setMaxDuration(Number(e.target.value))}
            disabled={busy}
          />
        </div>
        <div className="mt-4">
          <Textarea
            label="Contexto do programa (opcional)"
            placeholder="Ex.: Talk-show noturno com entrevistas a figuras públicas; público jovem-adulto."
            value={programContext}
            onChange={(e) => setProgramContext(e.target.value)}
            disabled={busy}
            className="min-h-[80px]"
            hint="Ajuda o modelo a perceber o tom e o que conta como um bom clip."
          />
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={visionCheck}
            onChange={(e) => setVisionCheck(e.target.checked)}
            disabled={busy}
            className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500/30"
          />
          Validar visualmente os melhores candidatos (frames enviados ao modelo, não o vídeo)
        </label>
      </Card>

      {error && (
        <Card className="flex items-center gap-3 border-red-200 bg-red-50 text-sm text-red-700">
          <AlertTriangle size={18} />
          {error}
        </Card>
      )}

      {phase === "done" && (
        <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
          Job criado. A redirecionar…
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        {phase === "uploading" && (
          <Button variant="outline" onClick={abort}>
            Cancelar upload
          </Button>
        )}
        <Button onClick={start} disabled={!file || busy}>
          <UploadCloud size={16} />
          {phase === "registering"
            ? "A registar…"
            : phase === "uploading"
              ? `A carregar ${progress}%`
              : phase === "queueing"
                ? "A criar job…"
                : "Carregar e sugerir clips"}
        </Button>
      </div>
    </div>
  );
}
