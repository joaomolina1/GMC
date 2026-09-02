import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  detectShots,
  escapeFilterPath,
  extractAudio,
  extractFrame,
  parseFfprobeJson,
  parseSceneChanges,
  probe,
  renderClip,
  spawnRunner,
  type FfmpegConfig,
} from "../src/ffmpeg";
import { NonRetryableError } from "../src/errors";
import { buildSrt } from "@lib/clips/subtitles";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";

describe("parseFfprobeJson", () => {
  it("extrai duração, fps e dimensões", () => {
    const info = parseFfprobeJson(
      JSON.stringify({
        format: { duration: "7200.5", size: "999" },
        streams: [
          { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "25/1" },
          { codec_type: "audio", codec_name: "aac" },
        ],
      })
    );
    expect(info).toMatchObject({ durationSec: 7200.5, fps: 25, width: 1920, height: 1080, hasAudio: true, hasVideo: true, sizeBytes: 999, codec: "h264" });
  });

  it("aceita frame rates fracionários e cai para r_frame_rate", () => {
    const info = parseFfprobeJson(
      JSON.stringify({ format: { duration: "1" }, streams: [{ codec_type: "video", avg_frame_rate: "0/0", r_frame_rate: "30000/1001" }] })
    );
    expect(info.fps).toBeCloseTo(29.97, 2);
    expect(info.hasAudio).toBe(false);
  });

  it("rejeita JSON inválido ou sem duração como não repetível", () => {
    expect(() => parseFfprobeJson("nope")).toThrow(NonRetryableError);
    expect(() => parseFfprobeJson(JSON.stringify({ streams: [] }))).toThrow(NonRetryableError);
  });
});

describe("parseSceneChanges", () => {
  it("emparelha pts_time com scene_score e ordena", () => {
    const out = parseSceneChanges(
      [
        "frame:10 pts:900000 pts_time:10.000",
        "lavfi.scene_score=0.512",
        "frame:3 pts:270000 pts_time:3.000",
        "lavfi.scene_score=0.900",
        "frame:99 pts:1 pts_time:99.0",
        "outra.coisa=1",
      ].join("\n")
    );
    expect(out).toEqual([
      { tSec: 3, score: 0.9 },
      { tSec: 10, score: 0.512 },
    ]);
  });

  it("devolve vazio sem cortes", () => {
    expect(parseSceneChanges("")).toEqual([]);
  });
});

describe("escapeFilterPath", () => {
  it("escapa ':' e '\\' para o filtro subtitles", () => {
    expect(escapeFilterPath("C:\\tmp\\a.srt")).toBe("C\\:\\\\tmp\\\\a.srt");
    expect(escapeFilterPath("/tmp/x/it's.srt")).toBe("/tmp/x/it\\'s.srt");
  });
});

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Smoke test com o ffmpeg real (salta se não estiver instalado): vídeo sintético de 6 s com
 * um corte duro aos 3 s (vermelho → azul) e tom sinusoidal, para exercitar cada wrapper.
 */
describe.skipIf(!hasFfmpeg())("ffmpeg real", () => {
  let dir: string;
  let source: string;
  const cfg: FfmpegConfig = { ffmpegBin: "ffmpeg", ffprobeBin: "ffprobe", run: spawnRunner };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "gmc-clips-ffmpeg-"));
    source = path.join(dir, "source.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=red:s=320x240:r=25:d=3",
        "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=3",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000:d=6",
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-map", "2:a",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-shortest", source,
      ],
      { stdio: "ignore" }
    );
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("probe lê duração/fps/dimensões", async () => {
    const info = await probe(cfg, source);
    expect(info.durationSec).toBeGreaterThan(5.5);
    expect(info.durationSec).toBeLessThan(6.6);
    expect(info.width).toBe(320);
    expect(info.height).toBe(240);
    expect(info.fps).toBe(25);
    expect(info.hasAudio).toBe(true);
    expect(info.hasVideo).toBe(true);
  });

  it("extractAudio produz WAV mono 16 kHz", async () => {
    const wav = path.join(dir, "audio.wav");
    await extractAudio(cfg, source, wav);
    const s = await stat(wav);
    // 6 s × 16000 Hz × 2 bytes ≈ 192 kB (+ cabeçalho).
    expect(s.size).toBeGreaterThan(180_000);
    expect(s.size).toBeLessThan(210_000);
    const header = (await readFile(wav)).subarray(0, 12).toString("ascii");
    expect(header.startsWith("RIFF")).toBe(true);
    expect(header.endsWith("WAVE")).toBe(true);
  });

  it("detectShots encontra o corte aos 3 s", async () => {
    const shots = await detectShots(cfg, source, 0.3);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    const near3 = shots.find((s) => Math.abs(s.tSec - 3) < 0.15);
    expect(near3).toBeDefined();
    expect(near3!.score).toBeGreaterThan(0.3);
  });

  it("extractFrame escreve um JPEG", async () => {
    const jpg = path.join(dir, "frame.jpg");
    await extractFrame(cfg, source, 1.0, jpg, { width: 160 });
    const buf = await readFile(jpg);
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
  });

  it("renderClip corta o intervalo e queima legendas SRT rebaseadas a zero", async () => {
    const segments = syntheticTranscript({ sentenceCount: 2, sentenceSec: 1.5, gapSec: 0.2, startSec: 2 });
    const srt = buildSrt(segments, { inSec: 2, outSec: 5 });
    expect(srt).toContain("00:00:00,000 -->");
    const srtPath = path.join(dir, "clip.srt");
    await writeFile(srtPath, srt, "utf8");

    const out = path.join(dir, "clip.mp4");
    let progressed = false;
    await renderClip(cfg, source, out, {
      inSec: 2,
      outSec: 5,
      srtPath,
      preset: "ultrafast",
      crf: 30,
      onProgress: () => {
        progressed = true;
      },
    });
    const info = await probe(cfg, out);
    expect(info.durationSec).toBeGreaterThan(2.8);
    expect(info.durationSec).toBeLessThan(3.3);
    expect(info.hasAudio).toBe(true);
    expect(progressed).toBe(true);
  });

  it("renderClip sem SRT também funciona", async () => {
    const out = path.join(dir, "clip-nosub.mp4");
    await renderClip(cfg, source, out, { inSec: 0.5, outSec: 2.5, srtPath: null, preset: "ultrafast", crf: 30 });
    const info = await probe(cfg, out);
    expect(info.durationSec).toBeGreaterThan(1.8);
    expect(info.durationSec).toBeLessThan(2.3);
  });

  it("aborta o processo quando o signal dispara", async () => {
    const ac = new AbortController();
    const out = path.join(dir, "aborted.mp4");
    const p = renderClip(cfg, source, out, { inSec: 0, outSec: 6, srtPath: null, preset: "veryslow", crf: 10, signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    await expect(p).rejects.toMatchObject({ name: "AbortedError" });
  });
});
