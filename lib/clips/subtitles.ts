import type { TimeRange, TranscriptSegment, Word } from "./types";

/**
 * Transcrição → SRT recortado ao intervalo do clip, com timestamps rebaseados a zero.
 * Função pura. O ffmpeg (`subtitles=`) lê SRT diretamente via libass.
 */

export interface SubtitleOptions {
  /** Máximo de caracteres por linha (quebra em 2 linhas). */
  maxLineChars?: number;
  /** Máximo de caracteres por legenda (2 linhas). */
  maxCueChars?: number;
  /** Duração máxima de uma legenda. */
  maxCueSec?: number;
  /** Duração mínima de uma legenda (estende o fim se possível). */
  minCueSec?: number;
  /** Prefixar o nome do orador quando muda. */
  includeSpeaker?: boolean;
}

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

const DEFAULTS: Required<SubtitleOptions> = {
  maxLineChars: 42,
  maxCueChars: 84,
  maxCueSec: 6,
  minCueSec: 0.8,
  includeSpeaker: false,
};

export function formatSrtTimestamp(sec: number): string {
  const total = Math.max(0, Math.round(sec * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Quebra o texto em até 2 linhas equilibradas, sem exceder `maxLineChars` quando possível. */
export function wrapCueText(text: string, maxLineChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLineChars) return clean;
  const words = clean.split(" ");
  let best = clean;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const over = Math.max(0, a.length - maxLineChars) + Math.max(0, b.length - maxLineChars);
    const score = over * 1000 + Math.abs(a.length - b.length);
    if (score < bestScore) {
      bestScore = score;
      best = `${a}\n${b}`;
    }
  }
  return best;
}

function wordsInRange(seg: TranscriptSegment, range: TimeRange): Word[] {
  if (seg.words.length === 0) return [];
  return seg.words.filter((w) => w.e > range.inSec && w.s < range.outSec);
}

/** Agrupa palavras em legendas respeitando limites de caracteres e duração. */
function groupWords(words: Word[], opts: Required<SubtitleOptions>): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      startSec: current[0].s,
      endSec: current[current.length - 1].e,
      text: current.map((w) => w.w).join(" "),
    });
    current = [];
  };
  for (const w of words) {
    if (current.length > 0) {
      const chars = current.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
      const dur = w.e - current[0].s;
      const endsSentence = /[.!?…]$/.test(current[current.length - 1].w);
      if (chars > opts.maxCueChars || dur > opts.maxCueSec || (endsSentence && chars > opts.maxCueChars / 2)) {
        flush();
      }
    }
    current.push(w);
  }
  flush();
  return cues;
}

/**
 * Recorta a transcrição ao intervalo e devolve legendas com tempos relativos ao clip.
 */
export function buildSubtitleCues(
  segments: TranscriptSegment[],
  range: TimeRange,
  options: SubtitleOptions = {}
): SubtitleCue[] {
  const opts = { ...DEFAULTS, ...options };
  const inRange = [...segments]
    .filter((s) => s.endSec > range.inSec && s.startSec < range.outSec)
    .sort((a, b) => a.startSec - b.startSec || a.idx - b.idx);

  const cues: SubtitleCue[] = [];
  let lastSpeaker: string | null | undefined;

  for (const seg of inRange) {
    const words = wordsInRange(seg, range);
    let segCues: SubtitleCue[];
    if (words.length > 0) {
      segCues = groupWords(words, opts);
    } else if (seg.words.length === 0) {
      // Sem alinhamento por palavra: usa o segmento inteiro recortado.
      segCues = [
        {
          startSec: Math.max(seg.startSec, range.inSec),
          endSec: Math.min(seg.endSec, range.outSec),
          text: seg.text,
        },
      ];
    } else {
      continue;
    }

    for (const cue of segCues) {
      let text = cue.text;
      if (opts.includeSpeaker && seg.speaker && seg.speaker !== lastSpeaker) {
        text = `${seg.speaker}: ${text}`;
      }
      lastSpeaker = seg.speaker;
      const start = Math.max(0, cue.startSec - range.inSec);
      const clipLen = range.outSec - range.inSec;
      let end = Math.min(clipLen, cue.endSec - range.inSec);
      if (end - start < opts.minCueSec) end = Math.min(clipLen, start + opts.minCueSec);
      if (end <= start) continue;
      cues.push({ startSec: start, endSec: end, text: wrapCueText(text, opts.maxLineChars) });
    }
  }

  // Evita sobreposição entre legendas consecutivas (o fim de uma não passa o início da seguinte).
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].endSec > cues[i + 1].startSec) {
      cues[i].endSec = Math.max(cues[i].startSec + 0.1, cues[i + 1].startSec - 0.01);
    }
  }

  return cues.filter((c) => c.text.trim().length > 0 && c.endSec > c.startSec);
}

export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}\n${cue.text}\n`
    )
    .join("\n");
}

/** Transcrição → SRT recortado ao clip (timestamps a partir de 00:00:00,000). */
export function buildSrt(
  segments: TranscriptSegment[],
  range: TimeRange,
  options: SubtitleOptions = {}
): string {
  return cuesToSrt(buildSubtitleCues(segments, range, options));
}
