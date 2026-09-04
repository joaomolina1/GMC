import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSrt } from "@lib/clips/subtitles";
import {
  segmentRowToSegment,
  type ClipCandidateRow,
  type ClipRenderRow,
  type TranscriptSegment,
  type TranscriptSegmentRow,
  type VideoAssetRow,
} from "@lib/clips/types";
import { NonRetryableError } from "./errors";
import { probe, renderClip, type FfmpegConfig } from "./ffmpeg";
import type { LogLevel } from "./log";
import { ensureLocal, fileSize, type StorageIO } from "./storage";
import { localPaths, objectPaths } from "./steps/context";
import type { ServiceClient } from "./supabase";

export interface RenderContext {
  supabase: ServiceClient;
  io: StorageIO;
  ffmpeg: FfmpegConfig;
  render: ClipRenderRow;
  /** Pasta de trabalho do asset (a mesma dos jobs). */
  workDirFor(assetId: string): string;
  signal: AbortSignal;
  heartbeat(): Promise<void>;
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  preset: string;
  crf: number;
}

export interface RenderOutcome {
  storagePath: string;
  durationSec: number;
  sizeBytes: number;
}

async function loadSegmentsInRange(
  supabase: ServiceClient,
  assetId: string,
  inSec: number,
  outSec: number
): Promise<TranscriptSegment[]> {
  const { data: t } = await supabase.from("transcripts").select("id").eq("video_asset_id", assetId).maybeSingle();
  if (!t) return [];
  const { data, error } = await supabase
    .from("transcript_segments")
    .select("transcript_id, idx, start_sec, end_sec, speaker, text, words")
    .eq("transcript_id", t.id)
    .gt("end_sec", inSec)
    .lt("start_sec", outSec)
    .order("idx");
  if (error) throw new Error(`Falha a ler transcript_segments: ${error.message}`);
  return ((data ?? []) as TranscriptSegmentRow[]).map(segmentRowToSegment);
}

/**
 * Render de um candidato aprovado. O trigger da BD já recusou renders de candidatos não
 * aprovados; reconfirmamos aqui na mesma (defesa em profundidade) antes de tocar no ffmpeg.
 */
export async function processRender(ctx: RenderContext): Promise<RenderOutcome> {
  const { render } = ctx;

  const { data: candidate, error: cErr } = await ctx.supabase
    .from("clip_candidates")
    .select("*")
    .eq("id", render.candidate_id)
    .maybeSingle();
  if (cErr) throw new Error(`Falha a ler candidato: ${cErr.message}`);
  if (!candidate) throw new NonRetryableError("Candidato do render não existe");
  const cand = candidate as ClipCandidateRow;
  if (cand.status !== "approved") {
    throw new NonRetryableError(`Candidato ${cand.id} não está aprovado (${cand.status}) — render recusado`);
  }

  const { data: asset, error: aErr } = await ctx.supabase
    .from("video_assets")
    .select("*")
    .eq("id", cand.video_asset_id)
    .maybeSingle();
  if (aErr) throw new Error(`Falha a ler asset: ${aErr.message}`);
  if (!asset) throw new NonRetryableError("Asset do candidato não existe");
  const videoAsset = asset as VideoAssetRow;

  const workDir = ctx.workDirFor(videoAsset.id);
  const pathsCtx = { workDir, asset: videoAsset };
  const sourcePath = await ensureLocal(ctx.io, videoAsset.storage_path, localPaths.source(pathsCtx));
  await ctx.heartbeat();

  const inSec = Number(render.in_sec);
  const outSec = Number(render.out_sec);
  const outputPath = localPaths.render(pathsCtx, render.id);
  const srtPath = localPaths.srt(pathsCtx, render.id);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let srt: string | null = null;
  if (render.burn_subtitles) {
    const segments = await loadSegmentsInRange(ctx.supabase, videoAsset.id, inSec, outSec);
    const text = buildSrt(segments, { inSec, outSec });
    if (text.trim()) {
      await writeFile(srtPath, text, "utf8");
      srt = srtPath;
    } else {
      ctx.log("warn", "sem legendas no intervalo — render sem subtitles", { renderId: render.id });
    }
  }

  let lastBeat = Date.now();
  await renderClip(ctx.ffmpeg, sourcePath, outputPath, {
    inSec,
    outSec,
    srtPath: srt,
    preset: ctx.preset,
    crf: ctx.crf,
    signal: ctx.signal,
    onProgress: () => {
      if (Date.now() - lastBeat > 30_000) {
        lastBeat = Date.now();
        void ctx.heartbeat();
      }
    },
  });

  const info = await probe(ctx.ffmpeg, outputPath, ctx.signal);
  const sizeBytes = await fileSize(outputPath);
  const storagePath = objectPaths.render(videoAsset, render.id);
  await ctx.io.upload(storagePath, outputPath, "video/mp4");

  await Promise.all([rm(outputPath, { force: true }), rm(srtPath, { force: true })]);

  ctx.log("info", "render concluído", {
    renderId: render.id,
    candidateId: cand.id,
    durationSec: info.durationSec,
    sizeBytes,
    subtitles: Boolean(srt),
  });

  return { storagePath, durationSec: info.durationSec, sizeBytes };
}
