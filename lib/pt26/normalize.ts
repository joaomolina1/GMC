import { ANSWER_KEYS, type AnswerKey } from "./types";

/** Minúsculas, sem acentos, espaços colapsados. Base de todas as comparações do import. */
export function normalizeText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const ANSWER_ALIASES: Record<string, AnswerKey> = {
  aprova: ANSWER_KEYS.APROVA,
  aprovo: ANSWER_KEYS.APROVA,
  desaprova: ANSWER_KEYS.DESAPROVA,
  desaprovo: ANSWER_KEYS.DESAPROVA,
  sim: ANSWER_KEYS.SIM,
  nao: ANSWER_KEYS.NAO,
  "ns/nr": ANSWER_KEYS.NSNR,
  "ns / nr": ANSWER_KEYS.NSNR,
  "ns-nr": ANSWER_KEYS.NSNR,
  nsnr: ANSWER_KEYS.NSNR,
  "ns nr": ANSWER_KEYS.NSNR,
  "nao sabe/nao responde": ANSWER_KEYS.NSNR,
  "nao sabe / nao responde": ANSWER_KEYS.NSNR,
  "nao sabe nao responde": ANSWER_KEYS.NSNR,
  "nao sabe ou nao responde": ANSWER_KEYS.NSNR,
  "ns / nr (nao sabe / nao responde)": ANSWER_KEYS.NSNR,
};

/** Devolve a resposta canónica (APROVA, DESAPROVA, SIM, NÃO, NS/NR) ou null. */
export function canonicalAnswer(input: unknown): AnswerKey | null {
  const n = normalizeText(input).replace(/\.$/, "");
  return ANSWER_ALIASES[n] ?? null;
}

/**
 * Converte a célula `Valor` em número: aceita número, "27,9", "27.9", "35%", "-37,7", "−14,8",
 * "1 234,5". Devolve null quando não é numérico.
 */
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "boolean" || input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/%/g, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
  // "1.234,5" → "1234.5" ; "27,9" → "27.9" ; "27.9" fica
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Número da pergunta a partir do nome da sheet: "P1", "p 1", "Pergunta 1", "Q1", "1", "P1 - Intenção".
 * Devolve null para sheets que não são perguntas (ex.: META).
 */
export function questionNumberFromSheetName(name: string): number | null {
  const n = normalizeText(name);
  if (!n || n === "meta") return null;
  const m = n.match(/^(?:p|q|pergunta|questao)?\s*0?([1-8])(?:\b|[^0-9])/);
  if (!m) return null;
  return Number(m[1]);
}

/** Iniciais para o avatar sem foto: "Maria da Graça Carvalho" → "MC". */
export function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 2 && w[0] === w[0].toUpperCase());
  const first = words[0]?.[0] ?? name.trim()[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Lê uma data de célula Excel (serial, Date ou texto ISO / DD/MM/AAAA) → "YYYY-MM-DD". */
export function parseExcelDate(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) return isoDate(input);
  if (typeof input === "number") {
    // serial Excel (1900) → dias desde 1899-12-30
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : isoDate(d);
  }
  const s = String(input).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
