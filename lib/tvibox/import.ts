import { z } from "zod";
import type { Cue } from "./subtitles";

/**
 * Importação de novelas prontas (zip ou MP4s soltos) para o TVI BOX.
 * Funções puras usadas pelo worker (scripts/tvibox/import.ts) e pela API/Estúdio.
 */

export interface SourceFile {
  name: string;
  /** Duração em segundos (null quando o ffprobe não consegue ler o ficheiro). */
  durationSeconds: number | null;
  sizeBytes: number;
}

export interface DetectedEpisode {
  number: number;
  file: SourceFile;
}

export interface Detection {
  episodes: DetectedEpisode[];
  warnings: string[];
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

export function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name) && !/(^|\/)\._/.test(name) && !/__MACOSX/.test(name);
}

/**
 * Número do episódio a partir do nome do ficheiro. Aceita "…_T1_E001.mp4", "EP12", "ep-3",
 * "Episódio 7", "07.mp4" e, em último recurso, o último número isolado do nome.
 */
export function detectEpisodeNumber(filename: string): number | null {
  const base = filename.split("/").pop() ?? filename;
  const stem = base.replace(/\.[a-z0-9]+$/i, "");
  const patterns = [/(?:^|[^a-z0-9])E(\d{1,3})(?![0-9])/i, /EP(?:IS[OÓ]DIO)?[\s._-]*(\d{1,3})(?![0-9])/i, /(?:^|[^0-9])(\d{1,3})(?![0-9])\s*$/];
  for (const re of patterns) {
    const m = stem.match(re);
    if (m) return Number(m[1]);
  }
  const all = stem.match(/(?<![0-9])\d{1,3}(?![0-9])/g);
  return all?.length ? Number(all[all.length - 1]) : null;
}

/**
 * Agrupa ficheiros por episódio, escolhe o melhor duplicado (o mais longo que o ffprobe lê)
 * e devolve a lista ordenada com avisos (duplicados, corrompidos, buracos na numeração).
 */
export function pickEpisodeFiles(files: SourceFile[]): Detection {
  const warnings: string[] = [];
  const byNumber = new Map<number, SourceFile[]>();
  for (const f of files) {
    if (!isVideoFile(f.name)) continue;
    const n = detectEpisodeNumber(f.name);
    if (n === null) {
      warnings.push(`Sem número de episódio no nome: ${f.name}`);
      continue;
    }
    byNumber.set(n, [...(byNumber.get(n) ?? []), f]);
  }
  const episodes: DetectedEpisode[] = [];
  for (const [number, group] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    const valid = group.filter((f) => (f.durationSeconds ?? 0) > 0);
    if (!valid.length) {
      warnings.push(`EP ${number}: nenhum ficheiro legível (${group.map((g) => g.name).join(", ")})`);
      continue;
    }
    if (group.length > 1) {
      const bad = group.filter((f) => !(f.durationSeconds ?? 0));
      warnings.push(
        `EP ${number}: ${group.length} ficheiros${bad.length ? `, ${bad.length} corrompido(s)` : ""} — usado o mais longo`
      );
    }
    const best = valid.sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0) || b.sizeBytes - a.sizeBytes)[0];
    episodes.push({ number, file: best });
  }
  for (let i = 1; i < episodes.length; i++) {
    const gap = episodes[i].number - episodes[i - 1].number;
    if (gap > 1) warnings.push(`Falta(m) episódio(s) entre EP ${episodes[i - 1].number} e EP ${episodes[i].number}`);
  }
  return { episodes, warnings };
}

/**
 * Título provável da série a partir dos nomes dos ficheiros: remove códigos de
 * emissão, marcas técnicas ("9 16", "TVIPLAYER", "T1_E001") e fica com o texto comum.
 */
export function seriesTitleFromFilenames(names: string[]): string | null {
  const cleaned = names
    .map((n) => (n.split("/").pop() ?? n).replace(/\.[a-z0-9.]+$/i, ""))
    .map((s) =>
      s
        .replace(/[_]+/g, " ")
        .replace(/^[A-Z0-9]{6,}\s+/, "")
        .replace(/\bT\d{1,2}\s?E\d{1,3}\b.*$/i, " ")
        .replace(/\b(EP(?:IS[OÓ]DIO)?)[\s.-]*\d{1,3}\b.*$/i, " ")
        .replace(/\b(9\s?[x×:]?\s?16|16\s?[x×:]?\s?9|TVI\s?PLAYER|TVI\s?BOX|VERTICAL|FINAL|LEVE|MASTER)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  if (!cleaned.length) return null;
  let common = cleaned[0];
  for (const c of cleaned.slice(1)) {
    let i = 0;
    while (i < common.length && i < c.length && common[i].toLowerCase() === c[i].toLowerCase()) i++;
    common = common.slice(0, i);
  }
  const title = common.replace(/[\s\-_.]+$/, "").trim();
  if (title.length < 3) return null;
  return titleCase(title);
}

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "em", "no", "na", "nos", "nas", "por", "para", "com", "um", "uma"]);

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Propostas geradas pelo modelo (validadas com zod antes de entrar na BD) */

export const episodeProposalSchema = z.object({
  title: z.string().trim().min(2).max(60),
  synopsis: z.string().trim().min(10).max(260),
  hookTitle: z.string().trim().min(2).max(60),
  hookText: z.string().trim().min(10).max(220),
  /** Índice (1–N) do frame da folha de contacto a usar como poster. */
  posterFrame: z.number().int().min(1).max(12),
  /** Resumo factual do que acontece (para dar continuidade ao episódio seguinte). */
  summary: z.string().trim().min(10).max(600),
  characters: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  /** Confiança do modelo na proposta (baixa quando há pouca fala/imagem). */
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});
export type EpisodeProposal = z.infer<typeof episodeProposalSchema>;

export const seriesProposalSchema = z.object({
  title: z.string().trim().min(2).max(80),
  genre: z.string().trim().min(2).max(40),
  tagline: z.string().trim().max(60).default(""),
  synopsis: z.string().trim().min(20).max(600),
  palette: z.object({ from: z.string().regex(/^#[0-9a-fA-F]{6}$/), to: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  cast: z.array(z.object({ name: z.string().trim().min(1).max(60), role: z.string().trim().min(1).max(120) })).max(20).default([]),
  badge: z.enum(["hot", "new"]).nullable().default("new"),
});
export type SeriesProposal = z.infer<typeof seriesProposalSchema>;

export const importProposalSchema = z.object({
  series: seriesProposalSchema,
  episodes: z.array(
    episodeProposalSchema.extend({
      number: z.number().int().min(1),
      durationSeconds: z.number().int().min(1),
      sourceName: z.string(),
    })
  ),
  warnings: z.array(z.string()).default([]),
});
export type ImportProposal = z.infer<typeof importProposalSchema>;

/** Extrai o primeiro objeto JSON de uma resposta do modelo (tolera cercas ``` e texto à volta). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Resposta sem JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

/* ------------------------------------------------------------------ */
/* Legendas a partir da transcrição (segmentos do Whisper) */

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
}

const MAX_CUE_CHARS = 84;
const MAX_CUE_SECONDS = 7;
const MIN_CUE_SECONDS = 1;

/**
 * Converte segmentos de ASR em legendas: junta espaços, parte segmentos longos em duas
 * linhas de tempo proporcionais (na pontuação quando possível) e evita sobreposições.
 */
export function segmentsToCues(segments: AsrSegment[]): Cue[] {
  const cues: Cue[] = [];
  for (const s of segments) {
    const text = s.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const dur = Math.max(0.6, s.end - s.start);
    if (text.length <= MAX_CUE_CHARS && dur <= MAX_CUE_SECONDS) {
      cues.push({ start: s.start, end: s.end, who: "", text });
      continue;
    }
    const parts = splitBalanced(text);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let t = s.start;
    for (const p of parts) {
      const d = (dur * p.length) / total;
      cues.push({ start: t, end: t + d, who: "", text: p });
      t += d;
    }
  }
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    // Legendas relâmpago ("Mas quem?") ficam pelo menos 1 s, sem pisar a seguinte.
    if (cues[i].end - cues[i].start < MIN_CUE_SECONDS) cues[i].end = cues[i].start + MIN_CUE_SECONDS;
    if (next && cues[i].end > next.start) cues[i].end = next.start;
  }
  return cues.filter((c) => c.end > c.start);
}

function splitBalanced(text: string): string[] {
  if (text.length <= MAX_CUE_CHARS) return [text];
  const mid = text.length / 2;
  const punct = [...text.matchAll(/[,.;:!?—-]\s/g)].map((m) => m.index! + m[0].length);
  const spaces = [...text.matchAll(/\s/g)].map((m) => m.index! + 1);
  const pick = (cands: number[]) => cands.reduce<number | null>((best, i) => (best === null || Math.abs(i - mid) < Math.abs(best - mid) ? i : best), null);
  const cut = pick(punct.filter((i) => Math.abs(i - mid) < text.length * 0.3)) ?? pick(spaces) ?? Math.floor(mid);
  const a = text.slice(0, cut).trim();
  const b = text.slice(cut).trim();
  return [...splitBalanced(a), ...splitBalanced(b)];
}
