import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { logUsage } from "@lib/audit";
import { frameOffsets, validateCandidateVisually, type VisionFrame } from "@lib/clips/vision";
import { CLIP_STEP_PROGRESS, type ClipCandidateRow } from "@lib/clips/types";
import { isAborted } from "../errors";
import { extractFrame } from "../ffmpeg";
import { errorMessage } from "../log";
import { ensureLocal } from "../storage";
import { localPaths, objectPaths, type StepContext, type StepFn } from "./context";

const FRAMES_PER_CANDIDATE = 3;

async function checkOne(ctx: StepContext, sourcePath: string, candidate: ClipCandidateRow): Promise<void> {
  const duration = Number(candidate.out_sec) - Number(candidate.in_sec);
  const offsets = frameOffsets(duration, FRAMES_PER_CANDIDATE);
  await mkdir(path.dirname(localPaths.frame(ctx, candidate.id, 0)), { recursive: true });

  const frames: VisionFrame[] = [];
  const objectPathsByIndex: string[] = [];
  for (let n = 0; n < offsets.length; n++) {
    const local = localPaths.frame(ctx, candidate.id, n);
    await extractFrame(ctx.ffmpeg, sourcePath, Number(candidate.in_sec) + offsets[n], local, { signal: ctx.signal });
    const data = await readFile(local);
    const object = objectPaths.frame(ctx.asset, candidate.id, n);
    await ctx.io.upload(object, local, "image/jpeg");
    objectPathsByIndex.push(object);
    frames.push({ data: data.toString("base64"), mediaType: "image/jpeg", offsetSec: offsets[n] });
  }

  const started = Date.now();
  const verdict = await validateCandidateVisually({
    candidate: {
      title: candidate.title,
      rationale: candidate.rationale ?? "",
      transcriptExcerpt: candidate.transcript_excerpt ?? "",
    },
    frames,
    model: ctx.models.vision,
  });

  await logUsage(ctx.supabase, {
    userId: ctx.job.user_id,
    model: verdict.model,
    provider: "anthropic",
    promptTokens: verdict.usage.promptTokens,
    completionTokens: verdict.usage.completionTokens,
    costEur: verdict.costEur,
    latencyMs: Date.now() - started,
    metadata: {
      source: "clips.vision",
      jobId: ctx.job.id,
      candidateId: candidate.id,
      promptId: verdict.promptId,
      promptVersion: verdict.promptVersion,
      frames: frames.length,
    },
  });

  const { error } = await ctx.supabase
    .from("clip_candidates")
    .update({
      vision_checked: true,
      vision_notes: verdict.coherent ? verdict.notes || null : `Incoerência visual: ${verdict.notes || "sem detalhes"}`,
      thumbnail_storage_path: objectPathsByIndex[verdict.best_frame_index] ?? objectPathsByIndex[0],
    })
    .eq("id", candidate.id);
  if (error) throw new Error(`Falha ao atualizar candidato: ${error.message}`);
}

/**
 * Só para os melhores candidatos: 2–3 frames JPEG → validação de contexto + thumbnail.
 * Uma falha num candidato não falha o job: fica marcado como verificado com a nota do erro.
 */
export const visionCheckStep: StepFn = async (ctx) => {
  if (!ctx.params.visionCheck || ctx.params.visionTopK <= 0) {
    ctx.log("info", "vision_check desligado por parâmetros", { jobId: ctx.job.id });
    return { nextStep: "ready", progress: CLIP_STEP_PROGRESS.ready };
  }

  const { data, error } = await ctx.supabase
    .from("clip_candidates")
    .select("*")
    .eq("job_id", ctx.job.id)
    .eq("vision_checked", false)
    .order("score", { ascending: false })
    .limit(ctx.params.visionTopK);
  if (error) throw new Error(`Falha a ler candidatos: ${error.message}`);
  const candidates = (data ?? []) as ClipCandidateRow[];
  if (candidates.length === 0) {
    return { nextStep: "ready", progress: CLIP_STEP_PROGRESS.ready };
  }

  const sourcePath = await ensureLocal(ctx.io, ctx.asset.storage_path, localPaths.source(ctx));
  const from = CLIP_STEP_PROGRESS.suggest;
  const to = CLIP_STEP_PROGRESS.vision_check;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      await checkOne(ctx, sourcePath, c);
    } catch (err) {
      if (isAborted(err) || ctx.signal.aborted) throw err;
      ctx.log("warn", "validação visual falhou para um candidato", { candidateId: c.id, error: errorMessage(err) });
      await ctx.supabase
        .from("clip_candidates")
        .update({ vision_checked: true, vision_notes: `Validação visual indisponível: ${errorMessage(err).slice(0, 300)}` })
        .eq("id", c.id);
    }
    await ctx.heartbeat(Math.round(from + ((to - from) * (i + 1)) / candidates.length));
  }

  ctx.log("info", "validação visual concluída", { jobId: ctx.job.id, checked: candidates.length });
  return { nextStep: "ready", progress: CLIP_STEP_PROGRESS.ready };
};
