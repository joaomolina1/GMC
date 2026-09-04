import { CLIP_STEP_PROGRESS } from "@lib/clips/types";
import { NonRetryableError } from "../errors";
import { probe } from "../ffmpeg";
import { ensureLocal } from "../storage";
import { localPaths, type StepFn } from "./context";

/** Descarrega o source, lê duração/fps/dimensões e atualiza `video_assets`. */
export const probeStep: StepFn = async (ctx) => {
  const sourcePath = await ensureLocal(ctx.io, ctx.asset.storage_path, localPaths.source(ctx));
  const info = await probe(ctx.ffmpeg, sourcePath, ctx.signal);

  if (!info.hasVideo) throw new NonRetryableError("O ficheiro não tem faixa de vídeo");
  if (!info.hasAudio) throw new NonRetryableError("O ficheiro não tem faixa de áudio — não é possível transcrever");

  const { error } = await ctx.supabase
    .from("video_assets")
    .update({
      duration_sec: info.durationSec,
      fps: info.fps,
      width: info.width,
      height: info.height,
      size_bytes: info.sizeBytes ?? ctx.asset.size_bytes,
    })
    .eq("id", ctx.asset.id);
  if (error) throw new Error(`Falha ao atualizar video_assets: ${error.message}`);

  ctx.log("info", "probe concluído", {
    assetId: ctx.asset.id,
    durationSec: info.durationSec,
    fps: info.fps,
    size: `${info.width}x${info.height}`,
    codec: info.codec,
  });

  return { nextStep: "extract_audio", progress: CLIP_STEP_PROGRESS.probe };
};
