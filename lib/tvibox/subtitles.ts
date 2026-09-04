import type { Beat, DialogueLine } from "./types";

export interface Cue {
  start: number;
  end: number;
  who: string;
  text: string;
}

/** Instantes de início de cada beat quando são contíguos a partir de `offset`. */
export function beatStarts(beats: Beat[], offset = 0): number[] {
  const starts: number[] = [];
  let t = offset;
  for (const b of beats) {
    starts.push(t);
    t += b.dur;
  }
  return starts;
}

/**
 * Distribui as falas de cada beat pelo respetivo intervalo de tempo,
 * proporcionalmente ao comprimento de cada fala (com uma pequena pausa entre elas).
 * `offset` desloca tudo (ex.: duração do genérico inicial); `starts` permite
 * impor instantes de início por beat (ex.: quando há transições sobrepostas).
 */
export function beatsToCues(
  beats: Beat[],
  offset = 0,
  lead = 0.4,
  gap = 0.25,
  starts: number[] = beatStarts(beats, offset)
): Cue[] {
  const cues: Cue[] = [];
  beats.forEach((beat, bi) => {
    const lines: DialogueLine[] = beat.lines;
    if (!lines.length) return;
    const t = starts[bi] ?? 0;
    const usable = Math.max(1, beat.dur - lead - gap * (lines.length - 1));
    const weights = lines.map((l) => Math.max(8, l.text.length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = t + lead;
    lines.forEach((l, i) => {
      const dur = (usable * weights[i]) / total;
      cues.push({ start: cursor, end: cursor + dur, who: l.who, text: l.text });
      cursor += dur + gap;
    });
  });
  return cues;
}

function ts(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

/** WebVTT em português, com o nome da personagem em <v>. */
export function cuesToVtt(cues: Cue[]): string {
  const out = ["WEBVTT", "", "NOTE Legendas TVI BOX — português europeu", ""];
  cues.forEach((c, i) => {
    out.push(String(i + 1));
    out.push(`${ts(c.start)} --> ${ts(c.end)}`);
    out.push(`<v ${c.who}>${c.text}`);
    out.push("");
  });
  return out.join("\n");
}

export function beatsToVtt(beats: Beat[], offset = 0): string {
  return cuesToVtt(beatsToCues(beats, offset));
}
