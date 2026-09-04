import { logUsage } from "@lib/audit";
import { suggestCandidates } from "@lib/clips/suggest";
import {
  CLIP_STEP_PROGRESS,
  segmentRowToSegment,
  type ShotChange,
  type TranscriptSegment,
  type TranscriptSegmentRow,
} from "@lib/clips/types";
import { NonRetryableError } from "../errors";
import type { StepContext, StepFn } from "./context";

const PAGE = 1000;

export async function loadTranscriptSegments(ctx: StepContext): Promise<TranscriptSegment[]> {
  const { data: t } = await ctx.supabase
    .from("transcripts")
    .select("id")
    .eq("video_asset_id", ctx.asset.id)
    .maybeSingle();
  if (!t) throw new NonRetryableError("Sem transcrição para o asset (passo transcribe não concluído?)");

  const segments: TranscriptSegment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase
      .from("transcript_segments")
      .select("transcript_id, idx, start_sec, end_sec, speaker, text, words")
      .eq("transcript_id", t.id)
      .order("idx")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha a ler transcript_segments: ${error.message}`);
    const rows = (data ?? []) as TranscriptSegmentRow[];
    segments.push(...rows.map(segmentRowToSegment));
    if (rows.length < PAGE) break;
  }
  return segments;
}

export async function loadShots(ctx: StepContext): Promise<ShotChange[]> {
  const shots: ShotChange[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase
      .from("shot_changes")
      .select("t_sec, score")
      .eq("video_asset_id", ctx.asset.id)
      .order("t_sec")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha a ler shot_changes: ${error.message}`);
    const rows = (data ?? []) as { t_sec: number; score: number | null }[];
    shots.push(...rows.map((r) => ({ tSec: Number(r.t_sec), score: r.score })));
    if (rows.length < PAGE) break;
  }
  return shots;
}

/**
 * Claude por janela de transcrição → candidatos snapados → `clip_candidates`.
 * Idempotente: substitui os candidatos pendentes do job. O custo é registado em
 * `usage_logs` em nome do dono do job.
 */
export const suggestStep: StepFn = async (ctx) => {
  const [segments, shots] = await Promise.all([loadTranscriptSegments(ctx), loadShots(ctx)]);
  await ctx.heartbeat();

  const from = CLIP_STEP_PROGRESS.transcribe;
  const to = CLIP_STEP_PROGRESS.suggest;

  const result = await suggestCandidates({
    segments,
    shots,
    videoDurationSec: ctx.asset.duration_sec ?? 0,
    params: ctx.params,
    model: ctx.models.suggest,
    onUsage: async (e) => {
      await logUsage(ctx.supabase, {
        userId: ctx.job.user_id,
        model: e.model,
        provider: "anthropic",
        promptTokens: e.usage.promptTokens,
        completionTokens: e.usage.completionTokens,
        costEur: e.costEur,
        latencyMs: e.latencyMs,
        metadata: {
          source: "clips.suggest",
          jobId: ctx.job.id,
          videoAssetId: ctx.asset.id,
          windowIndex: e.windowIndex,
          promptId: e.promptId,
          promptVersion: e.promptVersion,
          cacheReadTokens: e.usage.cacheReadTokens ?? 0,
          cacheCreationTokens: e.usage.cacheCreationTokens ?? 0,
        },
      });
    },
    onProgress: async (done, total) => {
      if (ctx.signal.aborted) throw new Error("Interrompido");
      await ctx.heartbeat(Math.round(from + ((to - from) * done) / Math.max(1, total)));
    },
  });

  const { error: delError } = await ctx.supabase
    .from("clip_candidates")
    .delete()
    .eq("job_id", ctx.job.id)
    .eq("status", "pending");
  if (delError) throw new Error(`Falha ao limpar candidatos anteriores: ${delError.message}`);

  if (result.candidates.length > 0) {
    const rows = result.candidates.map((c) => ({
      job_id: ctx.job.id,
      video_asset_id: ctx.asset.id,
      model_in_sec: c.modelInSec,
      model_out_sec: c.modelOutSec,
      in_sec: c.inSec,
      out_sec: c.outSec,
      title: c.title,
      score: c.score,
      rationale: c.rationale,
      transcript_excerpt: c.transcriptExcerpt,
      speakers: c.speakers,
      prompt_id: result.promptId,
      prompt_version: result.promptVersion,
      model: result.model,
      window_index: c.windowIndex,
      snap_debug: { ...c.snap, source: "worker" },
      vision_checked: false,
      status: "pending",
    }));
    const { error } = await ctx.supabase.from("clip_candidates").insert(rows);
    if (error) throw new Error(`Falha ao gravar candidatos: ${error.message}`);
  }

  ctx.log("info", "candidatos sugeridos", {
    jobId: ctx.job.id,
    windows: result.windows,
    candidates: result.candidates.length,
    dropped: result.dropped,
    costEur: result.costEur,
    model: result.model,
  });

  return { nextStep: "vision_check", progress: CLIP_STEP_PROGRESS.suggest };
};
