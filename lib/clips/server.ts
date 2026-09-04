import type { SupabaseClient } from "@supabase/supabase-js";
import { segmentsNear, sentencesFromSegments, snapToBoundaries, wordsFromSegments } from "./boundaries";
import { resolveClipJobParams } from "./types";
import type {
  ClipCandidateRow,
  ClipJobRow,
  SnapResult,
  TimeRange,
  TranscriptSegment,
  TranscriptSegmentRow,
  VideoAssetRow,
} from "./types";
import { segmentRowToSegment } from "./types";

/**
 * Helpers de servidor partilhados pelas rotas /api/clips/**. Todas as leituras usam o
 * cliente do utilizador (RLS aplica-se); nada aqui faz trabalho longo.
 */

export interface CandidateWithContext {
  candidate: ClipCandidateRow;
  job: ClipJobRow;
  asset: VideoAssetRow;
}

/** Carrega candidato + job + asset visíveis para o utilizador atual (RLS). */
export async function loadCandidateWithContext(
  supabase: SupabaseClient,
  candidateId: string
): Promise<CandidateWithContext | null> {
  const { data: candidate } = await supabase
    .from("clip_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return null;

  const [{ data: job }, { data: asset }] = await Promise.all([
    supabase.from("clip_jobs").select("*").eq("id", candidate.job_id).maybeSingle(),
    supabase.from("video_assets").select("*").eq("id", candidate.video_asset_id).maybeSingle(),
  ]);
  if (!job || !asset) return null;
  return {
    candidate: candidate as ClipCandidateRow,
    job: job as ClipJobRow,
    asset: asset as VideoAssetRow,
  };
}

/** Segmentos de transcrição de um asset perto de um intervalo (para re-snap no servidor). */
export async function loadSegmentsNear(
  supabase: SupabaseClient,
  videoAssetId: string,
  range: TimeRange,
  marginSec: number
): Promise<TranscriptSegment[]> {
  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id")
    .eq("video_asset_id", videoAssetId)
    .maybeSingle();
  if (!transcript) return [];

  const lo = Math.min(range.inSec, range.outSec) - marginSec;
  const hi = Math.max(range.inSec, range.outSec) + marginSec;
  const { data } = await supabase
    .from("transcript_segments")
    .select("transcript_id, idx, start_sec, end_sec, speaker, text, words")
    .eq("transcript_id", transcript.id)
    .gte("end_sec", lo)
    .lte("start_sec", hi)
    .order("idx");
  const rows = (data ?? []) as TranscriptSegmentRow[];
  return segmentsNear(rows.map(segmentRowToSegment), range, marginSec);
}

export async function loadShotsNear(
  supabase: SupabaseClient,
  videoAssetId: string,
  range: TimeRange,
  marginSec: number
): Promise<number[]> {
  const lo = Math.min(range.inSec, range.outSec) - marginSec;
  const hi = Math.max(range.inSec, range.outSec) + marginSec;
  const { data } = await supabase
    .from("shot_changes")
    .select("t_sec")
    .eq("video_asset_id", videoAssetId)
    .gte("t_sec", lo)
    .lte("t_sec", hi)
    .order("t_sec");
  return ((data ?? []) as { t_sec: number }[]).map((r) => Number(r.t_sec));
}

/**
 * Re-snap de um intervalo pedido pelo editor com a mesma função pura do worker.
 * Se não houver transcrição (ainda), devolve o intervalo apenas clampado ao vídeo.
 */
export async function resnapRange(
  supabase: SupabaseClient,
  ctx: CandidateWithContext,
  requested: TimeRange
): Promise<SnapResult> {
  const params = resolveClipJobParams(ctx.job.params);
  const margin = params.maxSnapSec + params.maxDurationSec + 5;
  const [segments, shots] = await Promise.all([
    loadSegmentsNear(supabase, ctx.asset.id, requested, margin),
    loadShotsNear(supabase, ctx.asset.id, requested, margin),
  ]);
  const videoDurationSec =
    ctx.asset.duration_sec && ctx.asset.duration_sec > 0
      ? ctx.asset.duration_sec
      : Math.max(requested.inSec, requested.outSec, ...segments.map((s) => s.endSec));

  return snapToBoundaries(requested, {
    sentences: sentencesFromSegments(segments),
    words: wordsFromSegments(segments),
    shots,
    maxSnapSec: params.maxSnapSec,
    minDurationSec: params.minDurationSec,
    maxDurationSec: params.maxDurationSec,
    videoDurationSec,
  });
}

export function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Só o dono da pasta (ou admin) pode obter URLs para objetos do bucket clips. */
export function storagePathBelongsTo(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`);
}
