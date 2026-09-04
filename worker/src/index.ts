import { mkdir } from "node:fs/promises";
import { getClipsSuggestModel, getClipsVisionModel } from "@lib/clips/config";
import { ConfigError, loadConfig } from "./config";
import { spawnRunner } from "./ffmpeg";
import { errorMessage, log } from "./log";
import { createQueueClient } from "./queue";
import { createStorageIO } from "./storage";
import { createServiceClient } from "./supabase";
import { SyntheticTranscriptionProvider } from "./transcription/fixture";
import { WhisperXProvider } from "./transcription/whisperx";
import { runLoop } from "./worker";

async function main() {
  const cfg = loadConfig();
  if (!cfg.enabled) {
    log("info", "CLIPS_WORKER_ENABLED=false — a sair sem processar");
    return;
  }
  if (!cfg.anthropicApiKey) {
    log("warn", "ANTHROPIC_API_KEY em falta: os passos suggest/vision_check vão falhar");
  }
  if (cfg.transcriptionProvider === "whisperx" && !cfg.whisper.hfToken) {
    log("warn", "HF_TOKEN em falta: a diarização pyannote (modelos gated) vai falhar no primeiro job");
  }
  if (cfg.transcriptionProvider === "fixture") {
    log("warn", "CLIPS_TRANSCRIPTION_PROVIDER=fixture — transcrição SINTÉTICA, só para smoke tests");
  }

  await mkdir(cfg.workDir, { recursive: true });

  const stop = new AbortController();
  const onSignal = (sig: string) => {
    if (stop.signal.aborted) return;
    log("info", `${sig} recebido — a terminar o passo atual e a libertar o lease`);
    stop.abort();
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  const supabase = createServiceClient(cfg);
  const ffmpeg = { ffmpegBin: cfg.ffmpegBin, ffprobeBin: cfg.ffprobeBin, run: spawnRunner };
  const transcriber =
    cfg.transcriptionProvider === "whisperx"
      ? new WhisperXProvider(cfg.whisper, spawnRunner, stop.signal)
      : new SyntheticTranscriptionProvider(ffmpeg, stop.signal, cfg.fixtureScriptPath);

  log("info", "clips-worker a arrancar", {
    workerId: cfg.workerId,
    supabaseUrl: cfg.supabaseUrl,
    transcription: cfg.transcriptionProvider,
    whisperModel: cfg.whisper.model,
    device: cfg.whisper.device,
    suggestModel: getClipsSuggestModel(),
    visionModel: getClipsVisionModel(),
    leaseSeconds: cfg.leaseSeconds,
    workDir: cfg.workDir,
  });

  await runLoop(
    {
      supabase,
      queue: createQueueClient(supabase, { workerId: cfg.workerId, leaseSeconds: cfg.leaseSeconds }),
      io: createStorageIO(supabase),
      ffmpeg,
      transcriber,
      models: { suggest: getClipsSuggestModel(), vision: getClipsVisionModel() },
      workerId: cfg.workerId,
      workRoot: cfg.workDir,
      heartbeatMs: cfg.heartbeatMs,
      renderPreset: cfg.renderPreset,
      renderCrf: cfg.renderCrf,
    },
    {
      pollIntervalMs: cfg.pollIntervalMs,
      processJobs: cfg.processJobs,
      processRenders: cfg.processRenders,
      cacheMaxAgeMs: 6 * 60 * 60_000,
    },
    stop.signal
  );

  log("info", "clips-worker terminado");
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    log("error", err.message);
    process.exit(2);
  }
  log("error", "erro fatal", { error: errorMessage(err) });
  process.exit(1);
});
