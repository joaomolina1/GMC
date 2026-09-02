import { readFile } from "node:fs/promises";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@lib/clips/transcription/provider";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";
import type { TranscriptSegment } from "@lib/clips/types";
import { probe, type FfmpegConfig } from "../ffmpeg";

/**
 * Provider sem ASR (`CLIPS_TRANSCRIPTION_PROVIDER=fixture`): gera uma transcrição sintética
 * com a duração real do áudio. Com `CLIPS_FIXTURE_SCRIPT=<ficheiro>` usa as frases desse
 * guião (uma por linha, prefixo `ORADOR:` opcional) distribuídas pela duração; sem guião,
 * frases numeradas. Serve para exercitar o pipeline ponta a ponta em máquinas sem GPU.
 * NUNCA usar em produção — o texto não corresponde ao conteúdo do vídeo.
 */
export class SyntheticTranscriptionProvider implements TranscriptionProvider {
  readonly name = "fixture";

  constructor(
    private readonly ffmpeg: FfmpegConfig,
    private readonly signal?: AbortSignal,
    private readonly scriptPath?: string | null
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const info = await probe(this.ffmpeg, input.audioPath, this.signal);
    const script = this.scriptPath ? parseScript(await readFile(this.scriptPath, "utf8")) : null;
    const segments = script && script.length > 0
      ? spreadScript(script, info.durationSec)
      : syntheticTranscript({
          sentenceCount: Math.max(1, Math.floor(info.durationSec / 4.4)),
          sentenceSec: 4,
          gapSec: 0.4,
        });
    return {
      provider: "fixture",
      model: script ? "script" : "synthetic",
      language: input.language ?? "pt",
      segments,
      raw: {
        provider: "fixture",
        model: script ? "script" : "synthetic",
        language: input.language ?? "pt",
        synthetic: true,
        durationSec: info.durationSec,
        script: this.scriptPath ?? null,
      },
    };
  }
}

export interface ScriptLine {
  speaker: string | null;
  text: string;
}

export function parseScript(raw: string): ScriptLine[] {
  const lines: ScriptLine[] = [];
  let lastSpeaker: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*):\s+(.+)$/);
    if (m) {
      lastSpeaker = m[1];
      lines.push({ speaker: m[1], text: m[2].trim() });
    } else {
      lines.push({ speaker: lastSpeaker, text: t });
    }
  }
  return lines;
}

/**
 * Distribui as frases pela duração: cada frase ocupa tempo proporcional ao nº de palavras
 * (~2,6 palavras/s), com 0,5 s de pausa entre frases; se o guião for mais curto que o áudio,
 * as pausas crescem; se for mais longo, a cadência acelera até caber.
 */
export function spreadScript(lines: ScriptLine[], durationSec: number): TranscriptSegment[] {
  const wordsPerSec = 2.6;
  const gap = 0.5;
  const counts = lines.map((l) => l.text.split(/\s+/).filter(Boolean).length);
  const speech = counts.reduce((n, c) => n + c / wordsPerSec, 0);
  const natural = speech + gap * Math.max(0, lines.length - 1);
  const usable = Math.max(1, durationSec - 1);
  const scale = natural > usable ? usable / natural : 1;
  const extraGap = natural < usable ? (usable - natural) / Math.max(1, lines.length) : 0;

  const segments: TranscriptSegment[] = [];
  let t = 0.5;
  lines.forEach((line, i) => {
    const words = line.text.split(/\s+/).filter(Boolean);
    const dur = (words.length / wordsPerSec) * scale;
    const perWord = dur / Math.max(1, words.length);
    const start = round3(t);
    const wordObjs = words.map((w, k) => ({
      w,
      s: round3(t + k * perWord),
      e: round3(t + (k + 1) * perWord - Math.min(0.03, perWord / 4)),
      p: 0.95,
    }));
    const end = round3(t + dur);
    segments.push({ idx: i, startSec: start, endSec: end, speaker: line.speaker, text: line.text, words: wordObjs });
    t = end + gap * scale + extraGap;
  });
  return segments;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
