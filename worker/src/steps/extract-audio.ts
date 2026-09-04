import { CLIP_STEP_PROGRESS } from "@lib/clips/types";
import { extractAudio } from "../ffmpeg";
import { ensureLocal, fileExists } from "../storage";
import { localPaths, objectPaths, type StepContext, type StepFn } from "./context";

/**
 * WAV mono 16 kHz. O resultado vai para o Storage (`audio.wav`) para que outro worker
 * possa retomar a transcrição sem repetir a extração.
 */
export async function ensureAudio(ctx: StepContext): Promise<string> {
  const audioPath = localPaths.audio(ctx);
  if (await fileExists(audioPath)) return audioPath;

  const audioObject = objectPaths.audio(ctx.asset);
  if (await ctx.io.exists(audioObject)) {
    await ctx.io.download(audioObject, audioPath);
    return audioPath;
  }

  const sourcePath = await ensureLocal(ctx.io, ctx.asset.storage_path, localPaths.source(ctx));
  await extractAudio(ctx.ffmpeg, sourcePath, audioPath, ctx.signal);
  await ctx.io.upload(audioObject, audioPath, "audio/wav");
  return audioPath;
}

export const extractAudioStep: StepFn = async (ctx) => {
  await ensureAudio(ctx);
  ctx.log("info", "áudio pronto", { assetId: ctx.asset.id });
  return { nextStep: "detect_shots", progress: CLIP_STEP_PROGRESS.extract_audio };
};
