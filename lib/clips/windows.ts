import { formatTimecode, type TranscriptSegment } from "./types";

/**
 * Janelas de transcrição para enviar ao modelo. Função pura.
 *
 * Cada janela cobre ~`windowSec` de programa (com `overlapSec` de sobreposição com a
 * anterior, para não perder momentos que caem na fronteira) e nunca excede `maxChars`
 * de texto formatado — se exceder, a janela fecha mais cedo no último segmento que cabe.
 */

export interface WindowOptions {
  windowSec: number;
  overlapSec: number;
  maxChars: number;
}

export interface TranscriptWindow {
  index: number;
  startSec: number;
  endSec: number;
  segments: TranscriptSegment[];
  /** Texto formatado (uma linha por segmento) pronto para o prompt. */
  text: string;
}

/** `[m:ss.s → m:ss.s] ORADOR: texto` */
export function formatSegmentLine(seg: TranscriptSegment): string {
  const speaker = seg.speaker ? `${seg.speaker}: ` : "";
  return `[${formatTimecode(seg.startSec)} → ${formatTimecode(seg.endSec)}] ${speaker}${seg.text.trim()}`;
}

export function formatSegments(segments: TranscriptSegment[]): string {
  return segments.map(formatSegmentLine).join("\n");
}

export function buildTranscriptWindows(
  segments: TranscriptSegment[],
  options: WindowOptions
): TranscriptWindow[] {
  const windowSec = Math.max(1, options.windowSec);
  const overlapSec = Math.max(0, Math.min(options.overlapSec, windowSec - 1));
  const maxChars = Math.max(200, options.maxChars);

  const sorted = [...segments]
    .filter((s) => s.text.trim().length > 0)
    .sort((a, b) => a.startSec - b.startSec || a.idx - b.idx);
  if (sorted.length === 0) return [];

  const windows: TranscriptWindow[] = [];
  let cursor = 0; // índice do primeiro segmento da próxima janela
  let index = 0;

  while (cursor < sorted.length) {
    const windowStart = sorted[cursor].startSec;
    const windowLimit = windowStart + windowSec;

    const picked: TranscriptSegment[] = [];
    let chars = 0;
    let i = cursor;
    for (; i < sorted.length; i++) {
      const seg = sorted[i];
      if (seg.startSec >= windowLimit && picked.length > 0) break;
      const line = formatSegmentLine(seg);
      if (chars + line.length + 1 > maxChars && picked.length > 0) break;
      picked.push(seg);
      chars += line.length + 1;
    }

    const endSec = Math.max(...picked.map((s) => s.endSec));
    windows.push({
      index,
      startSec: windowStart,
      endSec,
      segments: picked,
      text: formatSegments(picked),
    });
    index++;

    const lastPickedIndex = cursor + picked.length - 1;
    if (lastPickedIndex >= sorted.length - 1) break;

    // Próxima janela começa `overlapSec` antes do fim desta, mas avança sempre ≥ 1 segmento.
    const nextStartSec = endSec - overlapSec;
    let next = lastPickedIndex + 1;
    for (let j = cursor + 1; j <= lastPickedIndex; j++) {
      if (sorted[j].startSec >= nextStartSec) {
        next = j;
        break;
      }
    }
    cursor = Math.max(next, cursor + 1);
  }

  return windows;
}
