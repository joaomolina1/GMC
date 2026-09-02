import { z } from "zod";
import { computeModelCost, getProvider } from "@lib/ai/registry";
import type { TokenUsage } from "@lib/ai/types";
import { sentencesFromSegments, snapToBoundaries, wordsFromSegments } from "./boundaries";
import { candidateSelectionPrompt } from "./prompts/candidate-selection";
import type { CandidateSegment, ClipJobParams, ShotChange, TranscriptSegment } from "./types";
import { buildTranscriptWindows, type TranscriptWindow } from "./windows";

/**
 * Sugestão de candidatos: chama o Claude por janela de transcrição, valida a resposta
 * com Zod, clampa os timestamps ao transcript (a transcrição é a fonte de verdade — o
 * modelo nunca define timecode sozinho), faz snapping a fronteiras e deduplica entre janelas.
 *
 * O vídeo nunca é enviado ao modelo — só transcrição estruturada.
 */

export const modelCandidateSchema = z.object({
  title: z.string().min(1).max(200),
  start_sec: z.number().finite(),
  end_sec: z.number().finite(),
  score: z.number().min(0).max(100),
  rationale: z.string().default(""),
  speakers: z.array(z.string()).default([]),
});

export const modelResponseSchema = z.object({
  candidates: z.array(modelCandidateSchema).default([]),
});

export type ModelCandidate = z.infer<typeof modelCandidateSchema>;

export class ClipSuggestParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "ClipSuggestParseError";
  }
}

/** Extrai e valida o JSON da resposta (tolera cercas ```json e texto à volta). */
export function parseCandidateResponse(text: string): ModelCandidate[] {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new ClipSuggestParseError("Resposta sem objeto JSON", text);
  }
  let json: unknown;
  try {
    json = JSON.parse(body.slice(first, last + 1));
  } catch (err) {
    throw new ClipSuggestParseError(
      `JSON inválido: ${err instanceof Error ? err.message : String(err)}`,
      text
    );
  }
  const parsed = modelResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ClipSuggestParseError(`Resposta fora do schema: ${parsed.error.message}`, text);
  }
  return parsed.data.candidates;
}

export interface ModelGenerateFn {
  (opts: { system: string; user: string; maxTokens: number }): Promise<{ content: string; usage: TokenUsage }>;
}

/** Implementação por defeito: Claude via `getProvider()` do registry existente. */
export function createClaudeGenerate(model: string): ModelGenerateFn {
  return async ({ system, user, maxTokens }) => {
    const provider = getProvider(model);
    const result = await provider.generate({
      model,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens,
    });
    return { content: result.content, usage: result.usage };
  };
}

export interface SuggestUsageEvent {
  windowIndex: number;
  usage: TokenUsage;
  costEur: number;
  latencyMs: number;
  promptId: string;
  promptVersion: number;
  model: string;
}

export interface SuggestInput {
  segments: TranscriptSegment[];
  shots: ShotChange[];
  videoDurationSec: number;
  params: ClipJobParams;
  model: string;
  generate?: ModelGenerateFn;
  onUsage?: (event: SuggestUsageEvent) => void | Promise<void>;
  onProgress?: (done: number, total: number) => void | Promise<void>;
  /** Tentativas por janela quando a resposta não é JSON válido. */
  parseRetries?: number;
}

export interface SuggestResult {
  candidates: CandidateSegment[];
  windows: number;
  usage: TokenUsage;
  costEur: number;
  promptId: string;
  promptVersion: number;
  model: string;
  /** Candidatos do modelo descartados por validação/clamp. */
  dropped: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Clampa o intervalo do modelo à janela e ao transcript; devolve null se ficar vazio. */
export function clampToWindow(
  candidate: { start_sec: number; end_sec: number },
  window: { startSec: number; endSec: number },
  transcriptBounds: { startSec: number; endSec: number }
): { inSec: number; outSec: number } | null {
  const lo = Math.max(window.startSec, transcriptBounds.startSec);
  const hi = Math.min(window.endSec, transcriptBounds.endSec);
  if (hi <= lo) return null;
  const inSec = clamp(candidate.start_sec, lo, hi);
  const outSec = clamp(candidate.end_sec, lo, hi);
  if (outSec - inSec < 1) return null;
  return { inSec, outSec };
}

export function overlapRatio(a: { inSec: number; outSec: number }, b: { inSec: number; outSec: number }): number {
  const inter = Math.max(0, Math.min(a.outSec, b.outSec) - Math.max(a.inSec, b.inSec));
  if (inter <= 0) return 0;
  const union = Math.max(a.outSec, b.outSec) - Math.min(a.inSec, b.inSec);
  return union > 0 ? inter / union : 0;
}

/** Greedy por score: mantém um candidato se não se sobrepõe (IoU ≥ limiar) a nenhum já mantido. */
export function dedupeCandidates(candidates: CandidateSegment[], iouThreshold = 0.5): CandidateSegment[] {
  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.inSec - b.inSec || a.windowIndex - b.windowIndex
  );
  const kept: CandidateSegment[] = [];
  for (const c of sorted) {
    if (kept.some((k) => overlapRatio(k, c) >= iouThreshold)) continue;
    kept.push(c);
  }
  return kept;
}

function excerptFor(segments: TranscriptSegment[], inSec: number, outSec: number, maxChars = 700): string {
  const text = segments
    .filter((s) => s.endSec > inSec && s.startSec < outSec)
    .map((s) => s.text.trim())
    .join(" ")
    .replace(/\s+/g, " ");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function speakersFor(segments: TranscriptSegment[], inSec: number, outSec: number): string[] {
  const set = new Set<string>();
  for (const s of segments) {
    if (s.endSec > inSec && s.startSec < outSec && s.speaker) set.add(s.speaker);
  }
  return [...set].sort();
}

function addUsage(total: TokenUsage, u: TokenUsage): TokenUsage {
  return {
    promptTokens: total.promptTokens + u.promptTokens,
    completionTokens: total.completionTokens + u.completionTokens,
    cacheCreationTokens: (total.cacheCreationTokens ?? 0) + (u.cacheCreationTokens ?? 0),
    cacheReadTokens: (total.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0),
  };
}

const MAX_TOKENS = 2048;

/** Converte a resposta de uma janela em candidatos snapados e validados. */
export function candidatesFromWindow(
  modelCandidates: ModelCandidate[],
  window: TranscriptWindow,
  input: Pick<SuggestInput, "segments" | "shots" | "videoDurationSec" | "params">
): { candidates: CandidateSegment[]; dropped: number } {
  const { segments, params } = input;
  if (segments.length === 0) return { candidates: [], dropped: modelCandidates.length };
  const transcriptBounds = {
    startSec: Math.min(...segments.map((s) => s.startSec)),
    endSec: Math.max(...segments.map((s) => s.endSec)),
  };
  const snapCtx = {
    sentences: sentencesFromSegments(segments),
    words: wordsFromSegments(segments),
    shots: input.shots.map((s) => s.tSec),
    maxSnapSec: params.maxSnapSec,
    minDurationSec: params.minDurationSec,
    maxDurationSec: params.maxDurationSec,
    videoDurationSec: input.videoDurationSec > 0 ? input.videoDurationSec : transcriptBounds.endSec,
  };

  const out: CandidateSegment[] = [];
  let dropped = 0;
  for (const mc of modelCandidates) {
    const clamped = clampToWindow(mc, window, transcriptBounds);
    if (!clamped) {
      dropped++;
      continue;
    }
    const snap = snapToBoundaries(clamped, snapCtx);
    const dur = snap.outSec - snap.inSec;
    if (dur < Math.min(params.minDurationSec, 3) - 1e-6 || dur > params.maxDurationSec + 1e-6) {
      dropped++;
      continue;
    }
    const speakers = speakersFor(segments, snap.inSec, snap.outSec);
    out.push({
      title: mc.title.trim().slice(0, 120),
      score: Math.round(mc.score),
      rationale: mc.rationale.trim(),
      modelInSec: clamped.inSec,
      modelOutSec: clamped.outSec,
      inSec: snap.inSec,
      outSec: snap.outSec,
      speakers: speakers.length ? speakers : mc.speakers,
      transcriptExcerpt: excerptFor(segments, snap.inSec, snap.outSec),
      windowIndex: window.index,
      snap,
    });
  }
  return { candidates: out, dropped };
}

export async function suggestCandidates(input: SuggestInput): Promise<SuggestResult> {
  const { params, model } = input;
  const generate = input.generate ?? createClaudeGenerate(model);
  const prompt = candidateSelectionPrompt;
  const windows = buildTranscriptWindows(input.segments, {
    windowSec: params.windowSec,
    overlapSec: params.overlapSec,
    maxChars: params.maxWindowChars,
  });

  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  let costEur = 0;
  let dropped = 0;
  const all: CandidateSegment[] = [];
  const retries = input.parseRetries ?? 1;

  for (const window of windows) {
    const built = prompt.build({
      windowText: window.text,
      windowStartSec: window.startSec,
      windowEndSec: window.endSec,
      minDurationSec: params.minDurationSec,
      maxDurationSec: params.maxDurationSec,
      maxCandidates: params.candidatesPerWindow,
      language: params.language,
      programContext: params.programContext,
    });

    let modelCandidates: ModelCandidate[] | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries && modelCandidates === null; attempt++) {
      const started = Date.now();
      const user =
        attempt === 0
          ? built.user
          : `${built.user}\n\nA resposta anterior não era JSON válido. Responde só com o objeto JSON.`;
      const result = await generate({ system: built.system, user, maxTokens: MAX_TOKENS });
      const windowCost = computeModelCost(model, result.usage);
      usage = addUsage(usage, result.usage);
      costEur += windowCost;
      await input.onUsage?.({
        windowIndex: window.index,
        usage: result.usage,
        costEur: windowCost,
        latencyMs: Date.now() - started,
        promptId: prompt.id,
        promptVersion: prompt.version,
        model,
      });
      try {
        modelCandidates = parseCandidateResponse(result.content);
      } catch (err) {
        lastError = err;
      }
    }
    if (modelCandidates === null) {
      throw lastError instanceof Error ? lastError : new Error("Falha a interpretar a resposta do modelo");
    }

    const fromWindow = candidatesFromWindow(modelCandidates, window, input);
    dropped += fromWindow.dropped;
    all.push(...fromWindow.candidates);
    await input.onProgress?.(window.index + 1, windows.length);
  }

  const deduped = dedupeCandidates(all).slice(0, params.maxCandidates);

  return {
    candidates: deduped,
    windows: windows.length,
    usage,
    costEur,
    promptId: prompt.id,
    promptVersion: prompt.version,
    model,
    dropped,
  };
}
