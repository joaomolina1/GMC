import type { SnapEdge, SnapResult, TimeRange, TranscriptSegment } from "./types";

/**
 * Snapping de in/out a fronteiras naturais. Função pura e determinística.
 *
 * Regras (por ordem de prioridade):
 *  1. nunca cortar a meio de uma palavra;
 *  2. preferir a fronteira de frase mais próxima dentro da tolerância;
 *  3. dentro da tolerância, preferir o corte de plano mais próximo dessa fronteira,
 *     desde que entre o corte e a fronteira não haja fala;
 *  4. respeitar duração mínima/máxima e os limites do vídeo.
 *
 * Devolve sempre o que fez (`snappedIn`/`snappedOut`/`notes`) para debug e para a UI.
 */

export interface SentenceBoundary {
  startSec: number;
  endSec: number;
}

export interface WordSpan {
  s: number;
  e: number;
}

export interface SnapContext {
  sentences: SentenceBoundary[];
  /** Opcional: sem palavras, a regra "meio de palavra" usa as frases como aproximação. */
  words?: WordSpan[];
  shots: number[];
  maxSnapSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  videoDurationSec: number;
}

/** Cortes de plano que apanham a fronteira por uma margem ínfima ainda são "no ponto". */
const SHOT_EPSILON_SEC = 0.05;
const EPS = 1e-6;

type Direction = "both" | "backward" | "forward";

interface Prepared {
  sentenceStarts: number[];
  sentenceEnds: number[];
  words: WordSpan[];
  shots: number[];
}

function prepare(ctx: SnapContext): Prepared {
  const sentences = [...ctx.sentences]
    .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec >= s.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const words = (ctx.words && ctx.words.length > 0
    ? [...ctx.words]
    : sentences.map((s) => ({ s: s.startSec, e: s.endSec }))
  )
    .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e) && w.e >= w.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);
  const shots = [...new Set(ctx.shots.filter((t) => Number.isFinite(t)))].sort((a, b) => a - b);
  return {
    sentenceStarts: sentences.map((s) => s.startSec),
    sentenceEnds: sentences.map((s) => s.endSec),
    words,
    shots,
  };
}

function withinDirection(candidate: number, target: number, direction: Direction): boolean {
  if (direction === "backward") return candidate <= target + EPS;
  if (direction === "forward") return candidate >= target - EPS;
  return true;
}

/**
 * Escolhe o valor mais próximo de `target` dentro de `tolerance`. Em empate, `preferEarlier`
 * decide (true → o mais cedo). Devolve undefined se nada cabe na tolerância.
 */
function nearest(
  values: number[],
  target: number,
  tolerance: number,
  direction: Direction,
  preferEarlier: boolean
): number | undefined {
  let best: number | undefined;
  let bestDist = Infinity;
  for (const v of values) {
    if (!withinDirection(v, target, direction)) continue;
    const dist = Math.abs(v - target);
    if (dist > tolerance + EPS) continue;
    if (dist < bestDist - EPS) {
      best = v;
      bestDist = dist;
    } else if (Math.abs(dist - bestDist) <= EPS && best !== undefined) {
      if (preferEarlier ? v < best : v > best) best = v;
    }
  }
  return best;
}

function wordContaining(words: WordSpan[], t: number): WordSpan | undefined {
  return words.find((w) => w.s + EPS < t && t < w.e - EPS);
}

function regionHasSpeech(words: WordSpan[], a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo <= EPS) return false;
  return words.some((w) => w.s < hi - EPS && w.e > lo + EPS);
}

interface EdgeChoice {
  value: number;
  kind: SnapEdge["kind"];
  shotSec?: number;
}

function snapEdge(
  requested: number,
  edge: "in" | "out",
  p: Prepared,
  ctx: SnapContext,
  direction: Direction
): EdgeChoice {
  const isIn = edge === "in";
  const boundaries = isIn ? p.sentenceStarts : p.sentenceEnds;
  // In: empate → mais cedo (mais contexto). Out: empate → mais tarde (não corta a frase).
  const preferEarlier = isIn;

  let base: EdgeChoice | undefined;

  const sentence = nearest(boundaries, requested, ctx.maxSnapSec, direction, preferEarlier);
  if (sentence !== undefined) {
    base = { value: sentence, kind: "sentence" };
  } else {
    const inside = wordContaining(p.words, requested);
    if (inside) {
      // Regra absoluta: nunca a meio de palavra. In inclui a palavra, out também.
      const preferred = isIn ? inside.s : inside.e;
      const alternative = isIn ? inside.e : inside.s;
      const value = withinDirection(preferred, requested, direction) ? preferred : alternative;
      base = { value, kind: "word" };
    } else {
      const wordEdges = isIn ? p.words.map((w) => w.s) : p.words.map((w) => w.e);
      const word = nearest(wordEdges, requested, ctx.maxSnapSec, direction, preferEarlier);
      base = word !== undefined ? { value: word, kind: "word" } : { value: requested, kind: "none" };
    }
  }

  // Refinamento por corte de plano: só se não introduzir fala entre o corte e a fronteira.
  if (p.shots.length > 0 && ctx.maxSnapSec > 0) {
    const b = base.value;
    let bestShot: number | undefined;
    let bestDist = Infinity;
    for (const shot of p.shots) {
      const dist = Math.abs(shot - b);
      if (dist > ctx.maxSnapSec + EPS) continue;
      if (!withinDirection(shot, requested, direction)) continue;
      // In: corte antes da fronteira (lead-in silencioso) ou praticamente em cima.
      // Out: corte depois da fronteira (tail silencioso) ou praticamente em cima.
      const sideOk = isIn ? shot <= b + SHOT_EPSILON_SEC : shot >= b - SHOT_EPSILON_SEC;
      if (!sideOk) continue;
      if (regionHasSpeech(p.words, shot, b)) continue;
      if (dist < bestDist - EPS || (Math.abs(dist - bestDist) <= EPS && bestShot !== undefined && (preferEarlier ? shot < bestShot : shot > bestShot))) {
        bestShot = shot;
        bestDist = dist;
      }
    }
    if (bestShot !== undefined && Math.abs(bestShot - b) > EPS) {
      return { value: bestShot, kind: "shot", shotSec: bestShot };
    }
    if (bestShot !== undefined) {
      return { ...base, kind: base.kind === "none" ? "shot" : base.kind, shotSec: bestShot };
    }
  }

  return base;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function snapToBoundaries(range: TimeRange, ctx: SnapContext): SnapResult {
  const notes: string[] = [];
  let clamped = false;
  const duration = Math.max(0, ctx.videoDurationSec);

  let reqIn = Number.isFinite(range.inSec) ? range.inSec : 0;
  let reqOut = Number.isFinite(range.outSec) ? range.outSec : duration;

  if (reqIn > reqOut) {
    [reqIn, reqOut] = [reqOut, reqIn];
    notes.push("in > out: valores trocados");
    clamped = true;
  }
  if (reqIn < 0 || reqOut > duration) {
    notes.push("intervalo fora dos limites do vídeo");
    clamped = true;
  }
  reqIn = clamp(reqIn, 0, duration);
  reqOut = clamp(reqOut, 0, duration);

  const p = prepare(ctx);

  let inChoice = snapEdge(reqIn, "in", p, ctx, "both");
  let outChoice = snapEdge(reqOut, "out", p, ctx, "both");
  let inSec = clamp(inChoice.value, 0, duration);
  let outSec = clamp(outChoice.value, 0, duration);

  const maxDur = Math.max(ctx.maxDurationSec, EPS);
  const minDur = Math.max(0, Math.min(ctx.minDurationSec, maxDur));

  if (outSec - inSec > maxDur + EPS) {
    clamped = true;
    notes.push(`duração acima do máximo (${round(outSec - inSec)}s > ${maxDur}s): out recuado`);
    const target = inSec + maxDur;
    outChoice = snapEdge(target, "out", p, ctx, "backward");
    outSec = clamp(outChoice.value, inSec, duration);
    if (outSec - inSec > maxDur + EPS) outSec = inSec + maxDur;
    outChoice = { ...outChoice, kind: outChoice.kind === "none" ? "clamp" : outChoice.kind };
  }

  if (outSec - inSec < minDur - EPS) {
    clamped = true;
    notes.push(`duração abaixo do mínimo (${round(outSec - inSec)}s < ${minDur}s): out avançado`);
    const target = Math.min(inSec + minDur, duration);
    const forward = snapEdge(target, "out", p, ctx, "forward");
    let candidateOut = clamp(forward.value, inSec, duration);
    if (candidateOut - inSec > maxDur + EPS) candidateOut = inSec + maxDur;
    outSec = candidateOut;
    outChoice = { ...forward, kind: forward.kind === "none" ? "clamp" : forward.kind };

    if (outSec - inSec < minDur - EPS) {
      // Fim do vídeo: recua o in.
      const targetIn = Math.max(0, outSec - minDur);
      const backward = snapEdge(targetIn, "in", p, ctx, "backward");
      inSec = clamp(backward.value, 0, outSec);
      if (outSec - inSec > maxDur + EPS) inSec = outSec - maxDur;
      inChoice = { ...backward, kind: backward.kind === "none" ? "clamp" : backward.kind };
      notes.push("fim do vídeo: in recuado para cumprir a duração mínima");
      if (outSec - inSec < minDur - EPS) {
        notes.push("duração mínima não atingível dentro do vídeo");
      }
    }
  }

  if (outSec <= inSec + EPS) {
    clamped = true;
    notes.push("intervalo vazio após snapping: forçado ao mínimo");
    outSec = Math.min(duration, inSec + Math.max(minDur, 1));
    if (outSec <= inSec + EPS) {
      inSec = Math.max(0, outSec - Math.max(minDur, 1));
    }
    outChoice = { ...outChoice, kind: "clamp" };
  }

  inSec = round(inSec);
  outSec = round(outSec);

  return {
    inSec,
    outSec,
    snappedIn: {
      kind: inChoice.kind,
      deltaSec: round(inSec - reqIn),
      ...(inChoice.shotSec !== undefined ? { shotSec: round(inChoice.shotSec) } : {}),
    },
    snappedOut: {
      kind: outChoice.kind,
      deltaSec: round(outSec - reqOut),
      ...(outChoice.shotSec !== undefined ? { shotSec: round(outChoice.shotSec) } : {}),
    },
    clamped,
    notes,
  };
}

/** Fronteiras de frase a partir dos segmentos da transcrição. */
export function sentencesFromSegments(segments: TranscriptSegment[]): SentenceBoundary[] {
  return segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
}

/** Palavras (só timestamps) a partir dos segmentos. */
export function wordsFromSegments(segments: TranscriptSegment[]): WordSpan[] {
  const out: WordSpan[] = [];
  for (const seg of segments) {
    if (seg.words.length === 0) {
      out.push({ s: seg.startSec, e: seg.endSec });
      continue;
    }
    for (const w of seg.words) out.push({ s: w.s, e: w.e });
  }
  return out;
}

/** Restringe segmentos aos que podem influenciar o snapping de um intervalo. */
export function segmentsNear(
  segments: TranscriptSegment[],
  range: TimeRange,
  marginSec: number
): TranscriptSegment[] {
  const lo = Math.min(range.inSec, range.outSec) - marginSec;
  const hi = Math.max(range.inSec, range.outSec) + marginSec;
  return segments.filter((s) => s.endSec >= lo && s.startSec <= hi);
}
