import path from "node:path";
import type { TranscriptionProvider } from "@lib/clips/transcription/provider";
import { clipStoragePaths, type ClipJobParams, type ClipJobRow, type ClipJobStep, type VideoAssetRow } from "@lib/clips/types";
import type { FfmpegConfig } from "../ffmpeg";
import type { LogLevel } from "../log";
import type { StorageIO } from "../storage";
import type { ServiceClient } from "../supabase";

export interface StepModels {
  suggest: string;
  vision: string;
}

export interface StepContext {
  supabase: ServiceClient;
  io: StorageIO;
  ffmpeg: FfmpegConfig;
  transcriber: TranscriptionProvider;
  models: StepModels;
  job: ClipJobRow;
  asset: VideoAssetRow;
  params: ClipJobParams;
  /** Pasta de trabalho local do asset (partilhada entre passos e renders). */
  workDir: string;
  signal: AbortSignal;
  /** Renova o lease; opcionalmente atualiza o progresso (%). */
  heartbeat(progress?: number): Promise<void>;
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
}

export interface StepOutcome {
  nextStep: ClipJobStep;
  progress: number;
}

export type StepFn = (ctx: StepContext) => Promise<StepOutcome>;

export function sourceExt(asset: VideoAssetRow): string {
  const ext = asset.storage_path.split(".").pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : "mp4";
}

export const localPaths = {
  source: (ctx: Pick<StepContext, "workDir" | "asset">) => path.join(ctx.workDir, `source.${sourceExt(ctx.asset)}`),
  audio: (ctx: Pick<StepContext, "workDir">) => path.join(ctx.workDir, "audio.wav"),
  transcript: (ctx: Pick<StepContext, "workDir">) => path.join(ctx.workDir, "transcript.json"),
  frame: (ctx: Pick<StepContext, "workDir">, candidateId: string, n: number) =>
    path.join(ctx.workDir, "frames", `${candidateId}-${n}.jpg`),
  render: (ctx: Pick<StepContext, "workDir">, renderId: string) => path.join(ctx.workDir, "renders", `${renderId}.mp4`),
  srt: (ctx: Pick<StepContext, "workDir">, renderId: string) => path.join(ctx.workDir, "renders", `${renderId}.srt`),
};

export const objectPaths = {
  audio: (asset: VideoAssetRow) => clipStoragePaths.audio(asset.owner_id, asset.id),
  transcript: (asset: VideoAssetRow) => clipStoragePaths.transcript(asset.owner_id, asset.id),
  frame: (asset: VideoAssetRow, candidateId: string, n: number) =>
    clipStoragePaths.frame(asset.owner_id, asset.id, candidateId, n),
  render: (asset: VideoAssetRow, renderId: string) => clipStoragePaths.render(asset.owner_id, asset.id, renderId),
};
