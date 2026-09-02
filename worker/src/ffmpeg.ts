import { spawn } from "node:child_process";
import { AbortedError, NonRetryableError } from "./errors";

/**
 * Wrappers do ffmpeg/ffprobe. Toda a execução passa por `CommandRunner` para os testes
 * poderem substituir o binário; os parsers são funções puras exportadas.
 */

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Chamado com cada pedaço de stderr (progresso do ffmpeg). */
  onStderr?: (chunk: string) => void;
  maxOutputBytes?: number;
}

export interface CommandRunner {
  (bin: string, args: string[], options?: RunOptions): Promise<RunResult>;
}

export const spawnRunner: CommandRunner = (bin, args, options = {}) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const max = options.maxOutputBytes ?? 64 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5000).unref();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < max) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      options.onStderr?.(s);
      if (stderr.length < max) stderr += s;
    });
    child.on("error", (err) => {
      options.signal?.removeEventListener("abort", onAbort);
      reject(new NonRetryableError(`Não foi possível executar ${bin}: ${err.message}`, { cause: err }));
    });
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", onAbort);
      if (aborted) {
        reject(new AbortedError(`${bin} interrompido`));
        return;
      }
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });

export interface FfmpegConfig {
  ffmpegBin: string;
  ffprobeBin: string;
  run: CommandRunner;
}

export interface ProbeResult {
  durationSec: number;
  fps: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  sizeBytes: number | null;
  codec: string | null;
}

function parseFps(rate: string | undefined): number | null {
  if (!rate) return null;
  const [n, d] = rate.split("/").map(Number);
  if (!Number.isFinite(n)) return null;
  if (d === undefined) return n;
  if (!Number.isFinite(d) || d === 0) return null;
  const fps = n / d;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : null;
}

/** Interpreta o JSON do `ffprobe -show_format -show_streams`. */
export function parseFfprobeJson(json: string): ProbeResult {
  let data: {
    format?: { duration?: string; size?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      duration?: string;
    }>;
  };
  try {
    data = JSON.parse(json);
  } catch {
    throw new NonRetryableError("ffprobe devolveu JSON inválido");
  }
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new NonRetryableError("Não foi possível determinar a duração do vídeo");
  }
  return {
    durationSec: duration,
    fps: parseFps(video?.avg_frame_rate && video.avg_frame_rate !== "0/0" ? video.avg_frame_rate : video?.r_frame_rate),
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    sizeBytes: data.format?.size ? Number(data.format.size) : null,
    codec: video?.codec_name ?? null,
  };
}

export async function probe(cfg: FfmpegConfig, inputPath: string, signal?: AbortSignal): Promise<ProbeResult> {
  const res = await cfg.run(
    cfg.ffprobeBin,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath],
    { signal }
  );
  if (res.code !== 0) throw new NonRetryableError(`ffprobe falhou (${res.code}): ${res.stderr.trim().slice(-500)}`);
  return parseFfprobeJson(res.stdout);
}

/** WAV mono 16 kHz — o que o WhisperX espera. */
export async function extractAudio(
  cfg: FfmpegConfig,
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await cfg.run(
    cfg.ffmpegBin,
    ["-hide_banner", "-nostats", "-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", outputPath],
    { signal }
  );
  if (res.code !== 0) throw new Error(`ffmpeg (extract_audio) falhou (${res.code}): ${res.stderr.trim().slice(-500)}`);
}

export interface SceneChange {
  tSec: number;
  score: number;
}

/**
 * Interpreta a saída de `metadata=print` do filtro `select='gt(scene,T)'`:
 *   frame:12   pts:...  pts_time:3.000
 *   lavfi.scene_score=0.851
 */
export function parseSceneChanges(output: string): SceneChange[] {
  const out: SceneChange[] = [];
  let pending: number | null = null;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const frame = line.match(/pts_time:\s*(-?[\d.]+)/);
    if (frame) {
      pending = Number(frame[1]);
      continue;
    }
    const score = line.match(/lavfi\.scene_score=([\d.]+)/);
    if (score && pending !== null) {
      const t = Math.round(pending * 1000) / 1000;
      const s = Number(score[1]);
      if (Number.isFinite(t) && t >= 0 && Number.isFinite(s)) out.push({ tSec: t, score: Math.round(s * 1000) / 1000 });
      pending = null;
    }
  }
  return out.sort((a, b) => a.tSec - b.tSec);
}

/**
 * Deteção de cortes de plano em decode reduzido (escala 320px). Um VOD de 2 h demora minutos,
 * não segundos — por isso corre no worker e nunca na Vercel.
 */
export async function detectShots(
  cfg: FfmpegConfig,
  inputPath: string,
  threshold: number,
  signal?: AbortSignal
): Promise<SceneChange[]> {
  const t = Math.min(0.95, Math.max(0.05, threshold));
  const res = await cfg.run(
    cfg.ffmpegBin,
    [
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-an",
      "-sn",
      "-vf",
      `scale=320:-2,select='gt(scene,${t})',metadata=print:file=-`,
      "-f",
      "null",
      "-",
    ],
    { signal }
  );
  if (res.code !== 0) throw new Error(`ffmpeg (detect_shots) falhou (${res.code}): ${res.stderr.trim().slice(-500)}`);
  return parseSceneChanges(res.stdout);
}

export async function extractFrame(
  cfg: FfmpegConfig,
  inputPath: string,
  atSec: number,
  outputPath: string,
  options: { width?: number; quality?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const res = await cfg.run(
    cfg.ffmpegBin,
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-ss",
      atSec.toFixed(3),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${options.width ?? 640}:-2`,
      "-q:v",
      String(options.quality ?? 3),
      outputPath,
    ],
    { signal: options.signal }
  );
  if (res.code !== 0) throw new Error(`ffmpeg (frame) falhou (${res.code}): ${res.stderr.trim().slice(-500)}`);
}

/** Escapa um caminho para o argumento do filtro `subtitles=` (':' e '\' são especiais). */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export interface RenderOptions {
  inSec: number;
  outSec: number;
  srtPath?: string | null;
  preset?: string;
  crf?: number;
  signal?: AbortSignal;
  onProgress?: (outTimeSec: number) => void;
}

/**
 * Render final: `-ss` como opção de input (seek exato, timestamps do output a começar em 0 —
 * por isso o SRT vem rebaseado a zero) + filtro `subtitles=` para queimar legendas.
 */
export async function renderClip(
  cfg: FfmpegConfig,
  inputPath: string,
  outputPath: string,
  options: RenderOptions
): Promise<void> {
  const duration = options.outSec - options.inSec;
  if (!(duration > 0)) throw new NonRetryableError("Intervalo de render inválido");
  const vf: string[] = ["scale='min(1920,iw)':-2", "format=yuv420p"];
  if (options.srtPath) {
    vf.unshift(
      `subtitles=filename='${escapeFilterPath(options.srtPath)}':force_style='FontName=Arial,FontSize=20,Outline=1.5,Shadow=0.5,MarginV=40'`
    );
  }
  const args = [
    "-hide_banner",
    "-nostats",
    "-y",
    "-ss",
    options.inSec.toFixed(3),
    "-i",
    inputPath,
    "-t",
    duration.toFixed(3),
    "-vf",
    vf.join(","),
    "-c:v",
    "libx264",
    "-preset",
    options.preset ?? "veryfast",
    "-crf",
    String(options.crf ?? 20),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:2",
    outputPath,
  ];
  const res = await cfg.run(cfg.ffmpegBin, args, {
    signal: options.signal,
    onStderr: (chunk) => {
      const m = chunk.match(/out_time_ms=(\d+)/g);
      if (m && options.onProgress) {
        const last = m[m.length - 1].match(/(\d+)/);
        if (last) options.onProgress(Number(last[1]) / 1_000_000);
      }
    },
  });
  if (res.code !== 0) throw new Error(`ffmpeg (render) falhou (${res.code}): ${res.stderr.trim().slice(-800)}`);
}
