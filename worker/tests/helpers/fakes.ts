import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommandRunner, FfmpegConfig, RunResult } from "../../src/ffmpeg";
import type { StorageIO } from "../../src/storage";
import type { FakeStorage } from "./fake-supabase";

/** StorageIO em memória (bucket `clips`). */
export function createFakeStorageIO(store: FakeStorage): StorageIO & { uploads: string[]; downloads: string[] } {
  const uploads: string[] = [];
  const downloads: string[] = [];
  return {
    uploads,
    downloads,
    async download(objectPath, localPath) {
      const obj = store.objects.get(objectPath);
      if (!obj) throw new Error(`Objeto não encontrado no Storage: ${objectPath}`);
      downloads.push(objectPath);
      await mkdir(path.dirname(localPath), { recursive: true });
      await writeFile(localPath, obj.data);
    },
    async upload(objectPath, localPath, contentType) {
      store.objects.set(objectPath, { data: await readFile(localPath), contentType });
      uploads.push(objectPath);
    },
    async uploadBuffer(objectPath, data, contentType) {
      store.objects.set(objectPath, { data: Buffer.isBuffer(data) ? data : Buffer.from(data), contentType });
      uploads.push(objectPath);
    },
    async exists(objectPath) {
      return store.objects.has(objectPath);
    },
  };
}

export interface RecordedCall {
  bin: string;
  args: string[];
}

export interface FakeFfmpegOptions {
  probe?: Partial<{ duration: number; fps: string; width: number; height: number; audio: boolean; video: boolean }>;
  sceneChanges?: Array<{ t: number; score: number }>;
  failOn?: (call: RecordedCall) => string | null;
}

/**
 * CommandRunner que imita o ffmpeg/ffprobe sem os executar: cria os ficheiros de saída
 * (vazios com conteúdo marcador) e devolve stdout plausível para os parsers.
 */
export function createFakeFfmpeg(opts: FakeFfmpegOptions = {}): FfmpegConfig & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const probe = {
    duration: 120,
    fps: "25/1",
    width: 1920,
    height: 1080,
    audio: true,
    video: true,
    ...opts.probe,
  };

  const run: CommandRunner = async (bin, args, options) => {
    const call = { bin, args };
    calls.push(call);
    if (options?.signal?.aborted) {
      const { AbortedError } = await import("../../src/errors");
      throw new AbortedError();
    }
    const failure = opts.failOn?.(call);
    if (failure) return { stdout: "", stderr: failure, code: 1 } satisfies RunResult;

    if (bin.includes("ffprobe")) {
      const streams: Record<string, unknown>[] = [];
      if (probe.video) streams.push({ codec_type: "video", codec_name: "h264", width: probe.width, height: probe.height, avg_frame_rate: probe.fps });
      if (probe.audio) streams.push({ codec_type: "audio", codec_name: "aac" });
      return {
        stdout: JSON.stringify({ format: { duration: String(probe.duration), size: "1234567" }, streams }),
        stderr: "",
        code: 0,
      };
    }

    // ffmpeg: o último argumento é o output (exceto deteção de planos, que escreve em "-").
    const output = args[args.length - 1];
    if (output !== "-" && output) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `fake:${path.basename(output)}`);
    }
    if (args.some((a) => a.includes("gt(scene"))) {
      const lines = (opts.sceneChanges ?? []).flatMap((s, i) => [
        `frame:${i} pts:${Math.round(s.t * 90000)} pts_time:${s.t.toFixed(3)}`,
        `lavfi.scene_score=${s.score.toFixed(3)}`,
      ]);
      return { stdout: lines.join("\n"), stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "", code: 0 };
  };

  return { ffmpegBin: "ffmpeg", ffprobeBin: "ffprobe", run, calls };
}
