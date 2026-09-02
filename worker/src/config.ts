import os from "node:os";
import path from "node:path";

export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  anthropicApiKey: string | null;
  workerId: string;
  enabled: boolean;
  pollIntervalMs: number;
  leaseSeconds: number;
  heartbeatMs: number;
  workDir: string;
  /** "whisperx" (GPU, produção) ou "fixture" (sem ASR — para smoke tests). */
  transcriptionProvider: "whisperx" | "fixture";
  /** Guião opcional para o provider fixture (uma frase por linha). */
  fixtureScriptPath: string | null;
  whisper: {
    model: string;
    device: string;
    computeType: string;
    batchSize: number;
    hfToken: string | null;
    pythonBin: string;
    scriptPath: string;
  };
  ffmpegBin: string;
  ffprobeBin: string;
  renderPreset: string;
  renderCrf: number;
  /** Se false, o worker só processa clip_jobs (útil para separar GPU de CPU). */
  processRenders: boolean;
  processJobs: boolean;
}

export class ConfigError extends Error {
  readonly code = "CONFIG_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function requireString(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new ConfigError(`Variável de ambiente obrigatória em falta: ${name}`);
  return trimmed;
}

function intOr(name: string, raw: string | undefined, fallback: number, min = 1): number {
  const v = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isFinite(v) || v < min) throw new ConfigError(`${name} tem de ser um número ≥ ${min}`);
  return Math.floor(v);
}

function boolOr(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return !/^(0|false|no|off)$/i.test(raw.trim());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, rootDir = process.cwd()): WorkerConfig {
  const supabaseUrl = requireString("SUPABASE_URL", env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL);
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocolo");
  } catch {
    throw new ConfigError(`SUPABASE_URL tem de ser um URL http(s) válido (recebido: ${supabaseUrl.slice(0, 16)}…)`);
  }
  const serviceRoleKey = requireString(
    "SUPABASE_SERVICE_ROLE_KEY",
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY
  );
  const providerRaw = (env.CLIPS_TRANSCRIPTION_PROVIDER ?? "whisperx").trim().toLowerCase();
  if (providerRaw !== "whisperx" && providerRaw !== "fixture") {
    throw new ConfigError("CLIPS_TRANSCRIPTION_PROVIDER deve ser 'whisperx' ou 'fixture'");
  }

  const leaseSeconds = intOr("CLIPS_LEASE_SECONDS", env.CLIPS_LEASE_SECONDS, 900, 30);

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceRoleKey,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    workerId: env.WORKER_ID?.trim() || `${os.hostname()}-${process.pid}`,
    enabled: boolOr(env.CLIPS_WORKER_ENABLED, true),
    pollIntervalMs: intOr("CLIPS_POLL_INTERVAL_MS", env.CLIPS_POLL_INTERVAL_MS, 5000, 250),
    leaseSeconds,
    heartbeatMs: Math.min(intOr("CLIPS_HEARTBEAT_MS", env.CLIPS_HEARTBEAT_MS, 60_000, 1000), (leaseSeconds * 1000) / 3),
    workDir: env.CLIPS_WORK_DIR?.trim() || path.join(os.tmpdir(), "gmc-clips"),
    transcriptionProvider: providerRaw,
    fixtureScriptPath: env.CLIPS_FIXTURE_SCRIPT?.trim() || null,
    whisper: {
      model: env.WHISPER_MODEL?.trim() || "large-v3",
      device: env.WHISPERX_DEVICE?.trim() || "cuda",
      computeType: env.WHISPERX_COMPUTE_TYPE?.trim() || ((env.WHISPERX_DEVICE ?? "cuda") === "cpu" ? "int8" : "float16"),
      batchSize: intOr("WHISPERX_BATCH_SIZE", env.WHISPERX_BATCH_SIZE, 16),
      hfToken: env.HF_TOKEN?.trim() || null,
      pythonBin: env.PYTHON_BIN?.trim() || "python3",
      scriptPath: env.WHISPERX_SCRIPT?.trim() || path.join(rootDir, "asr", "transcribe.py"),
    },
    ffmpegBin: env.FFMPEG_BIN?.trim() || "ffmpeg",
    ffprobeBin: env.FFPROBE_BIN?.trim() || "ffprobe",
    renderPreset: env.CLIPS_RENDER_PRESET?.trim() || "veryfast",
    renderCrf: intOr("CLIPS_RENDER_CRF", env.CLIPS_RENDER_CRF, 20, 0),
    processRenders: boolOr(env.CLIPS_PROCESS_RENDERS, true),
    processJobs: boolOr(env.CLIPS_PROCESS_JOBS, true),
  };
}
