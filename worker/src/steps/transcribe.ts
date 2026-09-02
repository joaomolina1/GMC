import { countWords } from "@lib/clips/transcription/provider";
import { CLIP_STEP_PROGRESS, segmentToRow } from "@lib/clips/types";
import { NonRetryableError } from "../errors";
import { ensureAudio } from "./extract-audio";
import { objectPaths, type StepContext, type StepFn } from "./context";

const BATCH = 500;

async function existingTranscript(ctx: StepContext): Promise<{ id: string; segments: number } | null> {
  const { data: t } = await ctx.supabase
    .from("transcripts")
    .select("id")
    .eq("video_asset_id", ctx.asset.id)
    .maybeSingle();
  if (!t) return null;
  const { count } = await ctx.supabase
    .from("transcript_segments")
    .select("id", { count: "exact", head: true })
    .eq("transcript_id", t.id);
  return { id: t.id, segments: count ?? 0 };
}

/**
 * Transcrição com timestamps por palavra + diarização. Retomável: se já existe transcrição
 * completa para o asset (tentativa anterior), salta. Uma transcrição parcial (falha a meio
 * da gravação) é apagada e refeita.
 */
export const transcribeStep: StepFn = async (ctx) => {
  const existing = await existingTranscript(ctx);
  if (existing && existing.segments > 0) {
    ctx.log("info", "transcrição já existe — a saltar", { assetId: ctx.asset.id, segments: existing.segments });
    return { nextStep: "suggest", progress: CLIP_STEP_PROGRESS.transcribe };
  }
  if (existing) {
    await ctx.supabase.from("transcripts").delete().eq("id", existing.id);
  }

  const audioPath = await ensureAudio(ctx);
  await ctx.heartbeat();

  const result = await ctx.transcriber.transcribe({
    audioPath,
    language: ctx.params.language,
    diarize: true,
  });
  if (result.segments.length === 0) {
    throw new NonRetryableError("Transcrição vazia: o áudio não tem fala reconhecível");
  }

  await ctx.heartbeat();
  const rawObject = objectPaths.transcript(ctx.asset);
  await ctx.io.uploadBuffer(rawObject, JSON.stringify(result.raw ?? result), "application/json");

  const { data: transcript, error: tErr } = await ctx.supabase
    .from("transcripts")
    .insert({
      video_asset_id: ctx.asset.id,
      provider: result.provider,
      model: result.model,
      language: result.language,
      word_count: countWords(result.segments),
      raw_storage_path: rawObject,
    })
    .select("id")
    .single();
  if (tErr || !transcript) throw new Error(`Falha ao gravar transcript: ${tErr?.message ?? "sem id"}`);

  try {
    for (let i = 0; i < result.segments.length; i += BATCH) {
      const rows = result.segments.slice(i, i + BATCH).map((s) => segmentToRow(transcript.id, s));
      const { error } = await ctx.supabase.from("transcript_segments").insert(rows);
      if (error) throw new Error(`Falha ao gravar transcript_segments: ${error.message}`);
      await ctx.heartbeat();
    }
  } catch (err) {
    // Deixa a BD consistente: sem transcript parcial (a próxima tentativa refaz).
    await ctx.supabase.from("transcripts").delete().eq("id", transcript.id);
    throw err;
  }

  ctx.log("info", "transcrição gravada", {
    assetId: ctx.asset.id,
    provider: result.provider,
    model: result.model,
    segments: result.segments.length,
  });
  return { nextStep: "suggest", progress: CLIP_STEP_PROGRESS.transcribe };
};
