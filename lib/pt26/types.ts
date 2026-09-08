/** PT26 Tracking Poll — tipos partilhados (linhas da BD e payload do ecrã do pivot). */

export type QuestionKind = "PARTY" | "APPROVAL" | "YESNO" | "MINISTER" | "RANKING";
export type PersonKind = "PM" | "MINISTER" | "LEADER" | "OTHER";
export type WeekStatus = "DRAFT" | "PUBLISHED";

export const QUESTION_KINDS: QuestionKind[] = ["PARTY", "APPROVAL", "YESNO", "MINISTER", "RANKING"];
export const PERSON_KINDS: PersonKind[] = ["PM", "MINISTER", "LEADER", "OTHER"];

/** Respostas canónicas usadas em APPROVAL / YESNO / MINISTER. */
export const ANSWER_KEYS = {
  APROVA: "APROVA",
  DESAPROVA: "DESAPROVA",
  SIM: "SIM",
  NAO: "NÃO",
  NSNR: "NS/NR",
} as const;
export type AnswerKey = (typeof ANSWER_KEYS)[keyof typeof ANSWER_KEYS];

export const REQUIRED_ANSWERS: Partial<Record<QuestionKind, AnswerKey[]>> = {
  APPROVAL: [ANSWER_KEYS.APROVA, ANSWER_KEYS.DESAPROVA, ANSWER_KEYS.NSNR],
  YESNO: [ANSWER_KEYS.SIM, ANSWER_KEYS.NAO, ANSWER_KEYS.NSNR],
  MINISTER: [ANSWER_KEYS.SIM, ANSWER_KEYS.NAO, ANSWER_KEYS.NSNR],
};

/** Perguntas cujos valores são percentagens que devem somar ~100. */
export const PERCENTAGE_KINDS: QuestionKind[] = ["PARTY", "APPROVAL", "YESNO", "MINISTER"];

/* ---------------------------------------------------------------- linhas da BD */

export interface PartyRow {
  id: string;
  acronym: string;
  name: string;
  color: string;
  logo_path: string | null;
  sort_order: number;
}

export interface PersonRow {
  id: string;
  name: string;
  role: string | null;
  kind: PersonKind;
  party_id: string | null;
  photo_path: string | null;
  aliases: string[];
}

export interface QuestionRow {
  id: string;
  number: number;
  title: string;
  subtitle: string | null;
  kind: QuestionKind;
  sign: 1 | -1;
  sort_order: number;
}

export interface WeekRow {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  status: WeekStatus;
  source_file_name: string | null;
  imported_at: string | null;
  published_at: string | null;
}

export interface QuadroRow {
  id: string;
  week_id: string;
  question_id: string;
  idx: number;
  title: string | null;
  person_id: string | null;
}

export interface ResultRow {
  id: string;
  quadro_id: string;
  item_key: string;
  value: number | string; // NUMERIC chega como string do PostgREST
  person_id: string | null;
  party_id: string | null;
  sort_order: number;
}

export interface SettingsRow {
  live_token: string | null;
  footer_text: string | null;
  logo_year: string;
}

export interface ImportLogRow {
  id: string;
  week_id: string | null;
  week_date: string;
  file_name: string;
  status: "COMMITTED" | "FAILED";
  report: ImportReport;
  created_at: string;
}

/* ---------------------------------------------------------------- import */

export type IssueLevel = "error" | "warning";

export interface ImportIssue {
  level: IssueLevel;
  code: string;
  message: string;
  sheet?: string;
  row?: number;
}

export interface ParsedItem {
  /** Texto original da célula `Item`. */
  raw: string;
  /** Chave canónica guardada em `pt26_results.item_key` (sigla, nome ou resposta). */
  key: string;
  value: number;
  partyId: string | null;
  personId: string | null;
  /** true quando o item ficou associado a partido/pessoa ou é uma resposta canónica. */
  matched: boolean;
  row: number;
  sortOrder: number;
}

export interface ParsedQuadro {
  idx: number;
  title: string | null;
  personName: string | null;
  personId: string | null;
  items: ParsedItem[];
}

export interface ParsedQuestion {
  number: number;
  kind: QuestionKind;
  sheet: string | null;
  quadros: ParsedQuadro[];
}

export interface ParsedWorkbook {
  questions: ParsedQuestion[];
  issues: ImportIssue[];
  /** Data lida da sheet META (célula `Data`), se existir. */
  metaDate: string | null;
}

export interface ImportReport {
  fileName: string;
  weekDate: string;
  weekLabel: string;
  weekExists: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Itens sem correspondência (pessoa/partido) — alimenta a lista no back-office. */
  unmatched: { sheet: string; quadro: number; item: string; kind: QuestionKind }[];
  questions: ParsedQuestion[];
}

/** Estrutura enviada à RPC `pt26_replace_week`. */
export interface ReplaceWeekPayload {
  date: string;
  label?: string;
  source_file_name?: string;
  quadros: {
    question_number: number;
    idx: number;
    title: string | null;
    person_id: string | null;
    results: {
      item_key: string;
      value: number;
      person_id: string | null;
      party_id: string | null;
      sort_order: number;
    }[];
  }[];
}

/* ---------------------------------------------------------------- payload /api/pt26/live */

export interface LivePhoto {
  small: string; // 256px webp
  large: string; // 800px webp
}

export interface LiveParty {
  id: string;
  acronym: string;
  name: string;
  color: string;
  logoUrl: string | null;
  leaderId: string | null;
}

export interface LivePerson {
  id: string;
  name: string;
  role: string | null;
  kind: PersonKind;
  partyId: string | null;
  photo: LivePhoto | null;
}

export interface LiveQuestion {
  id: string;
  number: number;
  title: string;
  subtitle: string | null;
  kind: QuestionKind;
  sign: 1 | -1;
}

export interface LiveItem {
  key: string;
  value: number;
  /** null → primeira semana / sem correspondência na semana anterior. */
  delta: number | null;
  partyId: string | null;
  personId: string | null;
}

export interface LiveQuadro {
  idx: number;
  title: string | null;
  personId: string | null;
  items: LiveItem[];
  /** APPROVAL: aprova − desaprova (e variação face à semana anterior). */
  saldo: { value: number; delta: number | null } | null;
}

export interface LiveWeekQuestion {
  questionNumber: number;
  quadros: LiveQuadro[];
}

export interface LiveWeek {
  id: string;
  date: string;
  label: string;
  status: WeekStatus;
  /** "7 Set 2026" */
  dateLabel: string;
  /** "7 Set" */
  shortDate: string;
  questions: LiveWeekQuestion[];
}

export interface LivePayload {
  generatedAt: string;
  includesDrafts: boolean;
  settings: { footerText: string | null; logoYear: string };
  pmId: string | null;
  parties: Record<string, LiveParty>;
  people: Record<string, LivePerson>;
  questions: LiveQuestion[];
  /** Ordenadas por data ascendente. */
  weeks: LiveWeek[];
}
