import { z } from "zod";
import type { TranscriptSegment, Word } from "../types";

/**
 * Contrato de transcrição. As implementações concretas ficam fora de `lib/`:
 *  - as que precisam de binários (WhisperX + pyannote) vivem no worker;
 *  - as de API HTTP podem entrar aqui mais tarde sem mudar nada a montante.
 */

export interface TranscriptionInput {
  /** Caminho local do WAV mono 16 kHz. */
  audioPath: string;
  /** ISO 639-1 esperado (ex.: "pt"). */
  language?: string;
  diarize?: boolean;
}

export interface TranscriptionResult {
  provider: string;
  model: string;
  language: string;
  segments: TranscriptSegment[];
  /** JSON bruto do fornecedor, arquivado no Storage como `transcript.json`. */
  raw?: unknown;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

/** Formato canónico escrito pelo script ASR (worker/asr/transcribe.py) e por qualquer provider. */
export const canonicalWordSchema = z.object({
  w: z.string(),
  s: z.number(),
  e: z.number(),
  p: z.number().optional(),
  speaker: z.string().optional(),
});

export const canonicalSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  speaker: z.string().nullable().optional(),
  text: z.string(),
  words: z.array(canonicalWordSchema).default([]),
});

export const canonicalTranscriptionSchema = z.object({
  provider: z.string(),
  model: z.string().default("unknown"),
  language: z.string().default("pt"),
  segments: z.array(canonicalSegmentSchema),
});

export type CanonicalTranscription = z.infer<typeof canonicalTranscriptionSchema>;

/** Frases conhecidas de alucinação do Whisper em silêncio/música (conteúdo de broadcast). */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /legendas?\s+(pela|por)\s+(a\s+)?comunidade/i,
  /amara\.org/i,
  /^\s*\[?\s*(música|musica|aplausos|risos)\s*\]?\s*$/i,
  /obrigad[oa] por (assistir|ver)/i,
  /subscribe|inscreve-te no canal/i,
];

export function looksLikeHallucination(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(t));
}

/**
 * Valida e normaliza o JSON canónico: ordena, reindexa, remove segmentos vazios ou
 * alucinados e garante monotonicidade dos timestamps.
 */
export function normalizeTranscription(raw: unknown): TranscriptionResult {
  const parsed = canonicalTranscriptionSchema.parse(raw);
  const segments: TranscriptSegment[] = [];

  const sorted = [...parsed.segments].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const seg of sorted) {
    const text = seg.text.replace(/\s+/g, " ").trim();
    if (!text || looksLikeHallucination(text)) continue;
    if (!(seg.end >= seg.start)) continue;

    const words: Word[] = seg.words
      .filter((w) => w.w.trim().length > 0 && Number.isFinite(w.s) && Number.isFinite(w.e) && w.e >= w.s)
      .map((w) => ({
        w: w.w.trim(),
        s: w.s,
        e: w.e,
        ...(w.p !== undefined ? { p: w.p } : {}),
        ...(w.speaker ? { speaker: w.speaker } : {}),
      }))
      .sort((a, b) => a.s - b.s);

    segments.push({
      idx: segments.length,
      startSec: words.length ? Math.min(seg.start, words[0].s) : seg.start,
      endSec: words.length ? Math.max(seg.end, words[words.length - 1].e) : seg.end,
      speaker: seg.speaker ?? null,
      text,
      words,
    });
  }

  return {
    provider: parsed.provider,
    model: parsed.model,
    language: parsed.language,
    segments,
    raw,
  };
}

export function countWords(segments: TranscriptSegment[]): number {
  return segments.reduce(
    (n, s) => n + (s.words.length > 0 ? s.words.length : s.text.split(/\s+/).filter(Boolean).length),
    0
  );
}
