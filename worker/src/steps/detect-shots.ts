import { CLIP_STEP_PROGRESS } from "@lib/clips/types";
import { detectShots } from "../ffmpeg";
import { ensureLocal } from "../storage";
import { localPaths, type StepFn } from "./context";

const BATCH = 500;

/** Cortes de plano → `shot_changes`. Idempotente: substitui os do asset. */
export const detectShotsStep: StepFn = async (ctx) => {
  const sourcePath = await ensureLocal(ctx.io, ctx.asset.storage_path, localPaths.source(ctx));
  const shots = await detectShots(ctx.ffmpeg, sourcePath, ctx.params.sceneThreshold, ctx.signal);

  const { error: delError } = await ctx.supabase.from("shot_changes").delete().eq("video_asset_id", ctx.asset.id);
  if (delError) throw new Error(`Falha ao limpar shot_changes: ${delError.message}`);

  for (let i = 0; i < shots.length; i += BATCH) {
    const rows = shots.slice(i, i + BATCH).map((s) => ({
      video_asset_id: ctx.asset.id,
      t_sec: s.tSec,
      score: s.score,
    }));
    const { error } = await ctx.supabase.from("shot_changes").insert(rows);
    if (error) throw new Error(`Falha ao gravar shot_changes: ${error.message}`);
    await ctx.heartbeat();
  }

  ctx.log("info", "cortes de plano detetados", { assetId: ctx.asset.id, count: shots.length });
  return { nextStep: "transcribe", progress: CLIP_STEP_PROGRESS.detect_shots };
};
