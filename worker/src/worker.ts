import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { TranscriptionProvider } from "@lib/clips/transcription/provider";
import { resolveClipJobParams, type ClipJobRow, type ClipRenderRow, type VideoAssetRow } from "@lib/clips/types";
import { isAborted, isRetryable, NonRetryableError } from "./errors";
import type { FfmpegConfig } from "./ffmpeg";
import { errorMessage, log } from "./log";
import type { QueueClient } from "./queue";
import { processRender } from "./renders";
import { finalizeJob, runStep, type StepModels } from "./steps";
import type { StorageIO } from "./storage";
import type { ServiceClient } from "./supabase";

/**
 * Loop do worker: claim → executa UM passo → completa/renova lease → repete.
 * O mesmo worker continua o job enquanto detiver o lease; se morrer, outro retoma a partir
 * do cursor (`clip_jobs.step`). SIGTERM larga o lease em vez de o deixar expirar.
 */

export interface WorkerDeps {
  supabase: ServiceClient;
  queue: QueueClient;
  io: StorageIO;
  ffmpeg: FfmpegConfig;
  transcriber: TranscriptionProvider;
  models: StepModels;
  workerId: string;
  workRoot: string;
  heartbeatMs: number;
  renderPreset: string;
  renderCrf: number;
}

export interface JobRunResult {
  jobId: string;
  outcome: "done" | "failed" | "requeued" | "released" | "lost";
  stepsRun: number;
  error?: string;
}

export function assetWorkDir(workRoot: string, assetId: string): string {
  return path.join(workRoot, "assets", assetId);
}

async function loadAsset(supabase: ServiceClient, assetId: string): Promise<VideoAssetRow> {
  const { data, error } = await supabase.from("video_assets").select("*").eq("id", assetId).maybeSingle();
  if (error) throw new Error(`Falha a ler video_assets: ${error.message}`);
  if (!data) throw new NonRetryableError("Asset do job já não existe");
  return data as VideoAssetRow;
}

/** Corre o job passo a passo até 'ready', falha, perda de lease ou pedido de paragem. */
export async function processJob(deps: WorkerDeps, initial: ClipJobRow, stop: AbortSignal): Promise<JobRunResult> {
  let job = initial;
  let stepsRun = 0;
  const jobLog = (level: "debug" | "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}) =>
    log(level, message, { jobId: job.id, step: job.step, attempt: job.attempts, ...fields });

  const workDir = assetWorkDir(deps.workRoot, job.video_asset_id);
  await mkdir(workDir, { recursive: true });

  while (true) {
    if (stop.aborted) {
      const released = await deps.queue.releaseJob(job.id);
      jobLog("info", "paragem pedida entre passos — job libertado", { released });
      return { jobId: job.id, outcome: "released", stepsRun };
    }

    // Aborta o passo se perdermos o lease (outro worker reclamou) ou se chegar SIGTERM.
    const stepAbort = new AbortController();
    const onStop = () => stepAbort.abort();
    stop.addEventListener("abort", onStop, { once: true });
    let lostLease = false;

    const heartbeat = async (progress?: number) => {
      const ok = await deps.queue.heartbeatJob(job.id, progress);
      if (!ok && !lostLease) {
        lostLease = true;
        jobLog("warn", "lease perdido — a abortar o passo");
        stepAbort.abort();
      }
    };
    const timer = setInterval(() => {
      void heartbeat().catch((err) => jobLog("warn", "heartbeat falhou", { error: errorMessage(err) }));
    }, deps.heartbeatMs);

    try {
      const asset = await loadAsset(deps.supabase, job.video_asset_id);
      const params = resolveClipJobParams(job.params);
      jobLog("info", "a executar passo");

      const outcome = await runStep(job.step, {
        supabase: deps.supabase,
        io: deps.io,
        ffmpeg: deps.ffmpeg,
        transcriber: deps.transcriber,
        models: deps.models,
        job,
        asset,
        params,
        workDir,
        signal: stepAbort.signal,
        heartbeat,
        log: (level, message, fields) => jobLog(level, message, fields),
      });
      stepsRun++;

      if (lostLease) return { jobId: job.id, outcome: "lost", stepsRun };

      const updated = await deps.queue.completeStep(job.id, outcome.nextStep, outcome.progress);
      if (!updated) {
        jobLog("warn", "complete_clip_job_step não afetou o job (lease perdido?)");
        return { jobId: job.id, outcome: "lost", stepsRun };
      }
      job = updated;
      if (job.status === "done") {
        await finalizeJob({ workDir, log: (l, m, f) => jobLog(l, m, f), job });
        return { jobId: job.id, outcome: "done", stepsRun };
      }
    } catch (err) {
      if (lostLease) return { jobId: job.id, outcome: "lost", stepsRun, error: errorMessage(err) };
      if (stop.aborted || isAborted(err)) {
        const released = await deps.queue.releaseJob(job.id);
        jobLog("info", "passo interrompido — job libertado sem gastar tentativa", { released });
        return { jobId: job.id, outcome: "released", stepsRun };
      }
      const retryable = isRetryable(err);
      const message = errorMessage(err);
      jobLog("error", "passo falhou", { error: message, retryable });
      const failed = await deps.queue.failJob(job.id, message, retryable);
      return {
        jobId: job.id,
        outcome: failed?.status === "queued" ? "requeued" : "failed",
        stepsRun,
        error: message,
      };
    } finally {
      clearInterval(timer);
      stop.removeEventListener("abort", onStop);
    }
  }
}

export interface RenderRunResult {
  renderId: string;
  outcome: "done" | "failed" | "requeued" | "released" | "lost";
  error?: string;
}

export async function processRenderJob(deps: WorkerDeps, render: ClipRenderRow, stop: AbortSignal): Promise<RenderRunResult> {
  const rlog = (level: "debug" | "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}) =>
    log(level, message, { renderId: render.id, candidateId: render.candidate_id, ...fields });

  const stepAbort = new AbortController();
  const onStop = () => stepAbort.abort();
  stop.addEventListener("abort", onStop, { once: true });
  let lostLease = false;
  const heartbeat = async () => {
    const ok = await deps.queue.heartbeatRender(render.id);
    if (!ok && !lostLease) {
      lostLease = true;
      rlog("warn", "lease do render perdido — a abortar");
      stepAbort.abort();
    }
  };
  const timer = setInterval(() => {
    void heartbeat().catch((err) => rlog("warn", "heartbeat falhou", { error: errorMessage(err) }));
  }, deps.heartbeatMs);

  try {
    const outcome = await processRender({
      supabase: deps.supabase,
      io: deps.io,
      ffmpeg: deps.ffmpeg,
      render,
      workDirFor: (assetId) => assetWorkDir(deps.workRoot, assetId),
      signal: stepAbort.signal,
      heartbeat,
      log: rlog,
      preset: deps.renderPreset,
      crf: deps.renderCrf,
    });
    if (lostLease) return { renderId: render.id, outcome: "lost" };
    const updated = await deps.queue.completeRender(render.id, outcome.storagePath, outcome.durationSec, outcome.sizeBytes);
    return { renderId: render.id, outcome: updated ? "done" : "lost" };
  } catch (err) {
    if (lostLease) return { renderId: render.id, outcome: "lost", error: errorMessage(err) };
    if (stop.aborted || isAborted(err)) {
      await deps.queue.releaseRender(render.id);
      return { renderId: render.id, outcome: "released" };
    }
    const retryable = isRetryable(err);
    const message = errorMessage(err);
    rlog("error", "render falhou", { error: message, retryable });
    const failed = await deps.queue.failRender(render.id, message, retryable);
    return { renderId: render.id, outcome: failed?.status === "queued" ? "requeued" : "failed", error: message };
  } finally {
    clearInterval(timer);
    stop.removeEventListener("abort", onStop);
  }
}

/** Remove pastas de asset sem uso há mais de `maxAgeMs` (cache local do source). */
export async function sweepCache(workRoot: string, maxAgeMs: number): Promise<number> {
  const root = path.join(workRoot, "assets");
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const name of entries) {
    const dir = path.join(root, name);
    try {
      const s = await stat(dir);
      if (now - s.mtimeMs > maxAgeMs) {
        await rm(dir, { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* ignora */
    }
  }
  return removed;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(t);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export interface LoopOptions {
  pollIntervalMs: number;
  processJobs: boolean;
  processRenders: boolean;
  cacheMaxAgeMs: number;
}

/** Loop principal até `stop` disparar. */
export async function runLoop(deps: WorkerDeps, opts: LoopOptions, stop: AbortSignal): Promise<void> {
  let lastSweep = 0;
  while (!stop.aborted) {
    let didWork = false;
    try {
      if (opts.processJobs) {
        const job = await deps.queue.claimJob();
        if (job) {
          const result = await processJob(deps, job, stop);
          log("info", "job terminado", { ...result });
          didWork = true;
        }
      }
      if (!didWork && opts.processRenders && !stop.aborted) {
        const render = await deps.queue.claimRender();
        if (render) {
          const result = await processRenderJob(deps, render, stop);
          log("info", "render terminado", { ...result });
          didWork = true;
        }
      }
    } catch (err) {
      log("error", "erro no loop (a continuar)", { error: errorMessage(err) });
      await sleep(Math.min(opts.pollIntervalMs * 4, 30_000), stop);
      continue;
    }

    if (!didWork) {
      if (Date.now() - lastSweep > 10 * 60_000) {
        lastSweep = Date.now();
        const removed = await sweepCache(deps.workRoot, opts.cacheMaxAgeMs);
        if (removed > 0) log("info", "cache local varrida", { removed });
      }
      await sleep(opts.pollIntervalMs, stop);
    }
  }
}
