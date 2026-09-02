/**
 * Tipos partilhados do módulo de clips (Fase 1 — arquivo/VOD).
 * Corre na Next e no worker; nada aqui toca em binários.
 */

/** Palavra com timestamps (segundos) e confiança opcional. */
export interface Word {
  w: string;
  s: number;
  e: number;
  p?: number;
  speaker?: string;
}

/** Segmento de transcrição (≈ frase) com palavras alinhadas. */
export interface TranscriptSegment {
  idx: number;
  startSec: number;
  endSec: number;
  speaker?: string | null;
  text: string;
  words: Word[];
}

export interface ShotChange {
  tSec: number;
  score?: number | null;
}

export interface TimeRange {
  inSec: number;
  outSec: number;
}

export type SnapKind = "sentence" | "word" | "shot" | "none" | "clamp";

export interface SnapEdge {
  kind: SnapKind;
  /** Diferença aplicada em relação ao valor pedido (novo − pedido). */
  deltaSec: number;
  /** Se um corte de plano foi usado, o seu timestamp. */
  shotSec?: number;
}

export interface SnapResult extends TimeRange {
  snappedIn: SnapEdge;
  snappedOut: SnapEdge;
  /** true quando min/max de duração ou limites do vídeo forçaram um ajuste. */
  clamped: boolean;
  notes: string[];
}

export type ClipJobStatus = "queued" | "running" | "failed" | "done";

export type ClipJobStep =
  | "probe"
  | "extract_audio"
  | "detect_shots"
  | "transcribe"
  | "suggest"
  | "vision_check"
  | "ready";

export const CLIP_JOB_STEPS: readonly ClipJobStep[] = [
  "probe",
  "extract_audio",
  "detect_shots",
  "transcribe",
  "suggest",
  "vision_check",
  "ready",
] as const;

/** Progresso (%) reportado ao terminar cada passo. */
export const CLIP_STEP_PROGRESS: Record<ClipJobStep, number> = {
  probe: 5,
  extract_audio: 15,
  detect_shots: 25,
  transcribe: 65,
  suggest: 85,
  vision_check: 95,
  ready: 100,
};

export function nextClipJobStep(step: ClipJobStep): ClipJobStep {
  const i = CLIP_JOB_STEPS.indexOf(step);
  if (i < 0 || i === CLIP_JOB_STEPS.length - 1) return "ready";
  return CLIP_JOB_STEPS[i + 1];
}

export type ClipCandidateStatus = "pending" | "approved" | "rejected";
export type ClipRenderStatus = "queued" | "running" | "failed" | "done";

/** Parâmetros de um job (coluna `clip_jobs.params`). */
export interface ClipJobParams {
  /** Duração mínima/máxima de um clip (segundos). */
  minDurationSec: number;
  maxDurationSec: number;
  /** Tolerância máxima do snapping a fronteiras (segundos). */
  maxSnapSec: number;
  /** Janela de transcrição enviada ao modelo por chamada. */
  windowSec: number;
  overlapSec: number;
  maxWindowChars: number;
  /** Candidatos por janela pedidos ao modelo. */
  candidatesPerWindow: number;
  /** Máximo de candidatos guardados por job (após dedup, por score). */
  maxCandidates: number;
  /** Quantos dos melhores candidatos passam pela validação visual. */
  visionTopK: number;
  /** Desliga o passo vision_check. */
  visionCheck: boolean;
  /** Limiar do filtro `scene` do ffmpeg (0–1). */
  sceneThreshold: number;
  /** Língua esperada (ISO 639-1). */
  language: string;
  /** Contexto livre do programa para o prompt (opcional). */
  programContext?: string;
}

export const DEFAULT_CLIP_JOB_PARAMS: ClipJobParams = {
  minDurationSec: 20,
  maxDurationSec: 90,
  maxSnapSec: 1.5,
  windowSec: 600,
  overlapSec: 60,
  maxWindowChars: 14_000,
  candidatesPerWindow: 4,
  maxCandidates: 12,
  visionTopK: 5,
  visionCheck: true,
  sceneThreshold: 0.35,
  language: "pt",
};

/** Normaliza params vindos da BD/UI (parciais, possivelmente inválidos). */
export function resolveClipJobParams(input: unknown): ClipJobParams {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const num = (key: keyof ClipJobParams, min: number, max: number): number => {
    const v = Number(raw[key]);
    const fallback = DEFAULT_CLIP_JOB_PARAMS[key] as number;
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  };
  const minDurationSec = num("minDurationSec", 3, 600);
  const maxDurationSec = Math.max(minDurationSec + 1, num("maxDurationSec", 5, 900));
  return {
    minDurationSec,
    maxDurationSec,
    maxSnapSec: num("maxSnapSec", 0, 10),
    windowSec: num("windowSec", 60, 3600),
    overlapSec: num("overlapSec", 0, 600),
    maxWindowChars: num("maxWindowChars", 1000, 60_000),
    candidatesPerWindow: Math.round(num("candidatesPerWindow", 1, 10)),
    maxCandidates: Math.round(num("maxCandidates", 1, 50)),
    visionTopK: Math.round(num("visionTopK", 0, 20)),
    visionCheck: raw.visionCheck === undefined ? DEFAULT_CLIP_JOB_PARAMS.visionCheck : Boolean(raw.visionCheck),
    sceneThreshold: num("sceneThreshold", 0.05, 0.95),
    language:
      typeof raw.language === "string" && /^[a-z]{2}$/i.test(raw.language)
        ? raw.language.toLowerCase()
        : DEFAULT_CLIP_JOB_PARAMS.language,
    programContext:
      typeof raw.programContext === "string" && raw.programContext.trim()
        ? raw.programContext.trim().slice(0, 2000)
        : undefined,
  };
}

/** Candidato produzido pelo pipeline de sugestão (antes de ir para a BD). */
export interface CandidateSegment {
  title: string;
  score: number;
  rationale: string;
  /** Devolvido pelo modelo, já clampado ao transcript. */
  modelInSec: number;
  modelOutSec: number;
  /** Após snapping. */
  inSec: number;
  outSec: number;
  speakers: string[];
  transcriptExcerpt: string;
  windowIndex: number;
  snap: SnapResult;
}

/** Linhas da BD (colunas snake_case) usadas por rotas e worker. */
export interface ClipJobRow {
  id: string;
  video_asset_id: string;
  user_id: string;
  status: ClipJobStatus;
  step: ClipJobStep;
  progress: number;
  attempts: number;
  max_attempts: number;
  lease_until: string | null;
  worker_id: string | null;
  error: string | null;
  error_step: ClipJobStep | null;
  params: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoAssetRow {
  id: string;
  owner_id: string;
  filename: string;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  duration_sec: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegmentRow {
  id?: string;
  transcript_id: string;
  idx: number;
  start_sec: number;
  end_sec: number;
  speaker: string | null;
  text: string;
  words: Word[];
}

export interface ClipCandidateRow {
  id: string;
  job_id: string;
  video_asset_id: string;
  model_in_sec: number;
  model_out_sec: number;
  in_sec: number;
  out_sec: number;
  title: string;
  score: number;
  rationale: string | null;
  transcript_excerpt: string | null;
  speakers: string[];
  prompt_id: string;
  prompt_version: number;
  model: string;
  window_index: number | null;
  snap_debug: SnapResult | null;
  thumbnail_storage_path: string | null;
  vision_checked: boolean;
  vision_notes: string | null;
  status: ClipCandidateStatus;
  created_at: string;
  updated_at: string;
}

export interface ClipRenderRow {
  id: string;
  candidate_id: string;
  requested_by: string;
  status: ClipRenderStatus;
  in_sec: number;
  out_sec: number;
  burn_subtitles: boolean;
  storage_path: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  lease_until: string | null;
  worker_id: string | null;
  duration_sec: number | null;
  size_bytes: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function segmentRowToSegment(row: TranscriptSegmentRow): TranscriptSegment {
  return {
    idx: row.idx,
    startSec: Number(row.start_sec),
    endSec: Number(row.end_sec),
    speaker: row.speaker,
    text: row.text,
    words: Array.isArray(row.words) ? row.words : [],
  };
}

export function segmentToRow(transcriptId: string, seg: TranscriptSegment): TranscriptSegmentRow {
  return {
    transcript_id: transcriptId,
    idx: seg.idx,
    start_sec: seg.startSec,
    end_sec: seg.endSec,
    speaker: seg.speaker ?? null,
    text: seg.text,
    words: seg.words,
  };
}

/** Layout do bucket privado `clips`. */
export const CLIPS_BUCKET = "clips";

export function clipAssetFolder(userId: string, assetId: string): string {
  return `${userId}/${assetId}`;
}

export const clipStoragePaths = {
  source: (userId: string, assetId: string, ext: string) =>
    `${clipAssetFolder(userId, assetId)}/source.${ext.replace(/^\./, "").toLowerCase()}`,
  audio: (userId: string, assetId: string) => `${clipAssetFolder(userId, assetId)}/audio.wav`,
  transcript: (userId: string, assetId: string) => `${clipAssetFolder(userId, assetId)}/transcript.json`,
  frame: (userId: string, assetId: string, candidateId: string, n: number) =>
    `${clipAssetFolder(userId, assetId)}/frames/${candidateId}-${n}.jpg`,
  render: (userId: string, assetId: string, renderId: string) =>
    `${clipAssetFolder(userId, assetId)}/renders/${renderId}.mp4`,
};

/** Formata segundos como `mm:ss.d` (ou `h:mm:ss.d`). */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = rest.toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
