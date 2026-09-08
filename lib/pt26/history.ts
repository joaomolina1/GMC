import { decimalsForKind } from "./format";
import { findPreviousQuadro, itemIdentity } from "./live";
import { ANSWER_KEYS, type LivePayload, type LiveQuadro, type LiveWeek, type QuestionKind } from "./types";

export const HISTORY_PALETTE = ["#ffd166", "#4cc9f0", "#f78fb3", "#b9e04a", "#ff8a1f", "#22c8f5"];
const YES = "#37d67f";
const NO = "#ff4b5c";
const SALDO = "#ffd166";

export interface HistorySeries {
  label: string;
  color: string;
  decimals: number;
  /** "%" ou "" (saldo). */
  unit: string;
  /** Um valor por semana (null quando a semana não tem esse item). */
  values: (number | null)[];
}

export interface History {
  /** Semanas publicadas até à selecionada, inclusive (ordem cronológica). */
  weeks: LiveWeek[];
  series: HistorySeries[];
}

function quadroFor(week: LiveWeek, questionNumber: number, kind: QuestionKind, current: LiveQuadro): LiveQuadro | null {
  const q = week.questions.find((x) => x.questionNumber === questionNumber);
  if (!q) return null;
  return findPreviousQuadro({ idx: current.idx, personId: current.personId }, kind, q.quadros);
}

/**
 * Séries do gráfico de linhas: todas as semanas até `weekIdx`, seguindo o quadro ativo
 * (ex.: P1 quadro 2 → só os restantes partidos). Em APPROVAL inclui a linha do saldo.
 */
export function buildHistory(payload: LivePayload, questionNumber: number, current: LiveQuadro, weekIdx: number): History {
  const weeks = payload.weeks.slice(0, weekIdx + 1);
  const question = payload.questions.find((q) => q.number === questionNumber);
  if (!question) return { weeks, series: [] };
  const kind = question.kind;
  const decimals = decimalsForKind(kind);
  const quadros = weeks.map((w) => quadroFor(w, questionNumber, kind, current));

  const valueOf = (quadro: LiveQuadro | null, identity: string): number | null => {
    const it = quadro?.items.find((i) => itemIdentity(i) === identity);
    return it ? it.value : null;
  };
  const byKey = (key: string) => quadros.map((q) => valueOf(q, itemIdentity({ key, personId: null, partyId: null })));

  switch (kind) {
    case "APPROVAL":
      return {
        weeks,
        series: [
          { label: "Aprova", color: YES, decimals, unit: "%", values: byKey(ANSWER_KEYS.APROVA) },
          { label: "Desaprova", color: NO, decimals, unit: "%", values: byKey(ANSWER_KEYS.DESAPROVA) },
          { label: "Saldo", color: SALDO, decimals, unit: "", values: quadros.map((q) => q?.saldo?.value ?? null) },
        ],
      };
    case "YESNO":
    case "MINISTER":
      return {
        weeks,
        series: [
          { label: "Sim", color: YES, decimals, unit: "%", values: byKey(ANSWER_KEYS.SIM) },
          { label: "Não", color: NO, decimals, unit: "%", values: byKey(ANSWER_KEYS.NAO) },
        ],
      };
    case "PARTY":
      return {
        weeks,
        series: current.items.map((it, i) => ({
          label: it.partyId ? payload.parties[it.partyId]?.acronym ?? it.key : it.key,
          color: (it.partyId && payload.parties[it.partyId]?.color) || HISTORY_PALETTE[i % HISTORY_PALETTE.length],
          decimals,
          unit: "%",
          values: quadros.map((q) => valueOf(q, itemIdentity(it))),
        })),
      };
    default:
      return {
        weeks,
        series: current.items.map((it, i) => ({
          label: it.personId ? payload.people[it.personId]?.name ?? it.key : it.key,
          color: HISTORY_PALETTE[i % HISTORY_PALETTE.length],
          decimals,
          unit: "%",
          values: quadros.map((q) => valueOf(q, itemIdentity(it))),
        })),
      };
  }
}
