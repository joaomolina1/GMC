import type { Cue } from "./subtitles";

/** Palavra reconhecida por ASR (faster-whisper) com instantes em segundos. */
export interface AsrWord {
  w: string;
  s: number;
  e: number;
  p?: number;
}

export interface ScriptLine {
  who: string;
  text: string;
}

export interface AlignOptions {
  /** Antecipação do início da legenda em relação à primeira palavra (s). */
  lead?: number;
  /** Prolongamento após a última palavra (s). */
  tail?: number;
  /** Duração mínima de uma legenda (s). */
  minDuration?: number;
  /** Fração mínima de palavras da fala que têm de ser reconhecidas para a legenda entrar. */
  minCoverage?: number;
  /** Similaridade mínima (0–1) para duas palavras contarem como a mesma. */
  minSimilarity?: number;
}

export interface AlignResult {
  cues: Cue[];
  /** Falas do argumento sem correspondência suficiente no áudio (não geram legenda). */
  dropped: { line: ScriptLine; matched: number; total: number }[];
  /** Fração global de palavras do argumento encontradas no áudio. */
  coverage: number;
}

/** Normaliza para comparação: minúsculas, sem acentos nem pontuação. */
export function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function tokenize(text: string): string[] {
  return text
    .split(/[\s—–-]+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similaridade 0–1 tolerante a erros de ASR ("quanta"/"quanto", "despeie"/"despede"). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (!longest) return 0;
  return 1 - levenshtein(a, b) / longest;
}

interface Token {
  norm: string;
  line: number;
}

/**
 * Alinhamento global (Needleman–Wunsch) entre as palavras do argumento e as
 * palavras reconhecidas. Devolve, para cada palavra do argumento, o índice da
 * palavra ASR correspondente (ou -1).
 */
function alignTokens(script: Token[], asr: string[], minSimilarity: number): number[] {
  const n = script.length;
  const m = asr.length;
  const MATCH = 2;
  const GAP = -1;
  const MISMATCH = -1.5;
  const score: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1=diag 2=up 3=left
  for (let i = 1; i <= n; i++) {
    score[i][0] = i * GAP;
    move[i][0] = 2;
  }
  for (let j = 1; j <= m; j++) {
    score[0][j] = j * GAP;
    move[0][j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(script[i - 1].norm, asr[j - 1]);
      const diag = score[i - 1][j - 1] + (sim >= minSimilarity ? MATCH * sim : MISMATCH);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      const best = Math.max(diag, up, left);
      score[i][j] = best;
      // Em empate (palavra repetida em falas seguidas), prefere atribuir a palavra
      // reconhecida à fala mais antiga do argumento.
      move[i][j] = best === up ? 2 : best === diag ? 1 : 3;
    }
  }
  const map = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = i === 0 ? 3 : j === 0 ? 2 : move[i][j];
    if (mv === 1) {
      if (similarity(script[i - 1].norm, asr[j - 1]) >= minSimilarity) map[i - 1] = j - 1;
      i--;
      j--;
    } else if (mv === 2) i--;
    else j--;
  }
  return map;
}

/**
 * Coloca cada fala do argumento no instante em que é realmente dita no áudio.
 * Falas que o ASR não encontra (cortadas pelo modelo de vídeo) ficam de fora —
 * a legenda só aparece quando alguém fala.
 */
export function alignLinesToWords(lines: ScriptLine[], words: AsrWord[], opts: AlignOptions = {}): AlignResult {
  const { lead = 0.12, tail = 0.35, minDuration = 0.9, minCoverage = 0.4, minSimilarity = 0.7 } = opts;
  const script: Token[] = [];
  lines.forEach((l, li) => tokenize(l.text).forEach((norm) => script.push({ norm, line: li })));
  const asrNorm = words.map((w) => normalizeToken(w.w));
  const map = script.length && words.length ? alignTokens(script, asrNorm, minSimilarity) : new Array<number>(script.length).fill(-1);

  const perLine = lines.map(() => ({ total: 0, matched: [] as number[] }));
  script.forEach((t, i) => {
    perLine[t.line].total++;
    if (map[i] >= 0) perLine[t.line].matched.push(map[i]);
  });

  const cues: Cue[] = [];
  const dropped: AlignResult["dropped"] = [];
  let matchedTotal = 0;
  lines.forEach((line, li) => {
    const { total, matched } = perLine[li];
    matchedTotal += matched.length;
    const needed = Math.max(1, Math.ceil(total * minCoverage));
    if (!total || matched.length < needed) {
      if (total) dropped.push({ line, matched: matched.length, total });
      return;
    }
    // Ignora palavras isoladas muito afastadas do grosso da fala (falsos positivos).
    const times = matched.map((k) => words[k]).sort((a, b) => a.s - b.s);
    const core = trimOutliers(times);
    const start = Math.max(0, core[0].s - lead);
    const end = Math.max(core[core.length - 1].e + tail, start + minDuration);
    cues.push({ start, end, who: line.who, text: line.text });
  });

  cues.sort((a, b) => a.start - b.start);
  for (let k = 0; k < cues.length; k++) {
    const next = cues[k + 1];
    if (!next) break;
    const limit = next.start - 0.05 > cues[k].start ? next.start - 0.05 : next.start;
    if (cues[k].end > limit) cues[k].end = limit;
  }
  return { cues, dropped, coverage: script.length ? matchedTotal / script.length : 0 };
}

/** Remove palavras cujo instante está a mais de 4 s da mediana da fala (erros de alinhamento). */
function trimOutliers(sorted: AsrWord[]): AsrWord[] {
  if (sorted.length < 3) return sorted;
  const median = sorted[Math.floor(sorted.length / 2)].s;
  const kept = sorted.filter((w) => Math.abs(w.s - median) <= 4);
  return kept.length ? kept : sorted;
}

/** Extrai as falas (`<v Nome>texto`) de um WebVTT existente, para servir de argumento. */
export function linesFromVtt(vtt: string): ScriptLine[] {
  const lines: ScriptLine[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const m = raw.match(/^<v\s+([^>]+)>(.*)$/);
    if (m) lines.push({ who: m[1].trim(), text: m[2].trim() });
  }
  return lines;
}
