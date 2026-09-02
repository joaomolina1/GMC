import type { TranscriptSegment } from "../types";
import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from "./provider";
import { normalizeTranscription } from "./provider";

/**
 * Provider de fixtures para testes e para correr o worker sem GPU
 * (`CLIPS_TRANSCRIPTION_PROVIDER=fixture`). Devolve sempre o mesmo resultado.
 */
export class FixtureTranscriptionProvider implements TranscriptionProvider {
  readonly name = "fixture";
  private readonly result: TranscriptionResult;
  readonly calls: TranscriptionInput[] = [];

  constructor(result: TranscriptionResult | unknown) {
    this.result = isTranscriptionResult(result) ? result : normalizeTranscription(result);
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    this.calls.push(input);
    return { ...this.result, segments: this.result.segments.map((s) => ({ ...s, words: [...s.words] })) };
  }
}

function isTranscriptionResult(value: unknown): value is TranscriptionResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.segments) && typeof v.provider === "string" &&
    (v.segments.length === 0 || "startSec" in (v.segments[0] as object));
}

/**
 * Gera uma transcrição sintética determinística: `sentenceCount` frases de ~`sentenceSec`
 * segundos, alternando 2 oradores, com palavras alinhadas. Útil em testes e smoke-tests.
 */
export function syntheticTranscript(options: {
  sentenceCount: number;
  sentenceSec?: number;
  gapSec?: number;
  startSec?: number;
  speakers?: string[];
}): TranscriptSegment[] {
  const sentenceSec = options.sentenceSec ?? 4;
  const gapSec = options.gapSec ?? 0.4;
  const speakers = options.speakers ?? ["SPEAKER_00", "SPEAKER_01"];
  const segments: TranscriptSegment[] = [];
  let t = options.startSec ?? 0;
  for (let i = 0; i < options.sentenceCount; i++) {
    const wordsText = `Esta é a frase número ${i + 1} do programa de teste.`.split(" ");
    const perWord = sentenceSec / wordsText.length;
    const words = wordsText.map((w, k) => ({
      w,
      s: round3(t + k * perWord),
      e: round3(t + (k + 1) * perWord - 0.02),
      p: 0.95,
    }));
    segments.push({
      idx: i,
      startSec: round3(t),
      endSec: round3(t + sentenceSec),
      speaker: speakers[i % speakers.length],
      text: wordsText.join(" "),
      words,
    });
    t += sentenceSec + gapSec;
  }
  return segments;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
