import { formatDatePt } from "./format";
import { mediaUrl, photoUrl } from "./media";
import { normalizeText } from "./normalize";
import {
  ANSWER_KEYS,
  type LiveItem,
  type LivePayload,
  type LiveQuadro,
  type LiveWeek,
  type PartyRow,
  type PersonRow,
  type QuadroRow,
  type QuestionRow,
  type ResultRow,
  type SettingsRow,
  type WeekRow,
} from "./types";

export interface LiveSource {
  settings: SettingsRow | null;
  parties: PartyRow[];
  people: PersonRow[];
  questions: QuestionRow[];
  weeks: WeekRow[];
  quadros: QuadroRow[];
  results: ResultRow[];
  /** Base pública do bucket (ver `mediaBaseUrl`). */
  mediaBase: string;
  includeDrafts: boolean;
  now?: Date;
}

const num = (v: number | string): number => (typeof v === "number" ? v : Number(v));

/** Variação face à semana anterior arredondada a 2 casas (evita 0,1 − 0,1 = 1e-17). */
export function computeDelta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || Number.isNaN(previous)) return null;
  return Math.round((current - previous) * 100) / 100;
}

/** Saldo de aprovação: aprova − desaprova. Null quando falta uma das respostas. */
export function computeSaldo(items: { key: string; value: number }[]): number | null {
  const a = items.find((i) => i.key === ANSWER_KEYS.APROVA);
  const d = items.find((i) => i.key === ANSWER_KEYS.DESAPROVA);
  if (!a || !d) return null;
  return Math.round((a.value - d.value) * 100) / 100;
}

/** Identidade de um item para o emparelhar com a semana anterior: pessoa > partido > chave normalizada. */
function itemIdentity(i: { key: string; personId: string | null; partyId: string | null }): string {
  if (i.personId) return `person:${i.personId}`;
  if (i.partyId) return `party:${i.partyId}`;
  return `key:${normalizeText(i.key)}`;
}

/**
 * Quadro homólogo na semana anterior: nos quadros por ministro (MINISTER) segue-se a pessoa;
 * nos restantes o índice do quadro.
 */
export function findPreviousQuadro(
  current: { idx: number; personId: string | null },
  kind: QuestionRow["kind"],
  previous: LiveQuadro[]
): LiveQuadro | null {
  if (kind === "MINISTER" && current.personId) {
    const byPerson = previous.find((q) => q.personId === current.personId);
    if (byPerson) return byPerson;
    if (previous.some((q) => q.personId)) return null;
  }
  return previous.find((q) => q.idx === current.idx) ?? null;
}

export function buildLivePayload(src: LiveSource): LivePayload {
  const questions = [...src.questions].sort((a, b) => a.number - b.number);
  const weeks = src.weeks
    .filter((w) => src.includeDrafts || w.status === "PUBLISHED")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const people: LivePayload["people"] = {};
  for (const p of src.people) {
    people[p.id] = {
      id: p.id,
      name: p.name,
      role: p.role,
      kind: p.kind,
      partyId: p.party_id,
      photo: p.photo_path
        ? { small: photoUrl(src.mediaBase, p.photo_path, 256), large: photoUrl(src.mediaBase, p.photo_path, 800) }
        : null,
    };
  }

  const parties: LivePayload["parties"] = {};
  for (const party of [...src.parties].sort((a, b) => a.sort_order - b.sort_order)) {
    const leader =
      src.people.find((p) => p.party_id === party.id && p.kind === "LEADER") ??
      src.people.find((p) => p.party_id === party.id && p.kind === "PM") ??
      null;
    parties[party.id] = {
      id: party.id,
      acronym: party.acronym,
      name: party.name,
      color: party.color,
      logoUrl: party.logo_path ? mediaUrl(src.mediaBase, party.logo_path) : null,
      leaderId: leader?.id ?? null,
    };
  }

  const pm = src.people.find((p) => p.kind === "PM") ?? null;

  const quadrosByWeek = new Map<string, QuadroRow[]>();
  for (const q of src.quadros) {
    const list = quadrosByWeek.get(q.week_id) ?? [];
    list.push(q);
    quadrosByWeek.set(q.week_id, list);
  }
  const resultsByQuadro = new Map<string, ResultRow[]>();
  for (const r of src.results) {
    const list = resultsByQuadro.get(r.quadro_id) ?? [];
    list.push(r);
    resultsByQuadro.set(r.quadro_id, list);
  }

  const liveWeeks: LiveWeek[] = [];
  let previousWeek: LiveWeek | null = null;

  for (const week of weeks) {
    const dates = formatDatePt(week.date);
    const liveWeek: LiveWeek = {
      id: week.id,
      date: week.date,
      label: week.label,
      status: week.status,
      dateLabel: dates.long,
      shortDate: dates.short,
      questions: [],
    };
    const weekQuadros = quadrosByWeek.get(week.id) ?? [];

    for (const question of questions) {
      const prevQuestion = previousWeek?.questions.find((q) => q.questionNumber === question.number);
      const prevQuadros = prevQuestion?.quadros ?? [];
      const quadros = weekQuadros
        .filter((q) => q.question_id === question.id)
        .sort((a, b) => a.idx - b.idx)
        .map((q): LiveQuadro => {
          const rows = (resultsByQuadro.get(q.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
          const prev = findPreviousQuadro({ idx: q.idx, personId: q.person_id }, question.kind, prevQuadros);
          const prevItems = new Map<string, LiveItem>();
          for (const it of prev?.items ?? []) prevItems.set(itemIdentity(it), it);

          const items: LiveItem[] = rows.map((r) => {
            const value = num(r.value);
            const identity = itemIdentity({ key: r.item_key, personId: r.person_id, partyId: r.party_id });
            const before = prevItems.get(identity);
            return {
              key: r.item_key,
              value,
              delta: computeDelta(value, before?.value),
              partyId: r.party_id,
              personId: r.person_id,
            };
          });

          let saldo: LiveQuadro["saldo"] = null;
          if (question.kind === "APPROVAL") {
            const value = computeSaldo(items);
            if (value !== null) saldo = { value, delta: computeDelta(value, prev?.saldo?.value) };
          }

          // P3 (aprovação do PM) sem pessoa explícita → cara do Primeiro-Ministro
          const personId =
            q.person_id ?? (question.kind === "APPROVAL" && question.number === 3 ? pm?.id ?? null : null);

          return { idx: q.idx, title: q.title, personId, items, saldo };
        });
      liveWeek.questions.push({ questionNumber: question.number, quadros });
    }

    liveWeeks.push(liveWeek);
    previousWeek = liveWeek;
  }

  return {
    generatedAt: (src.now ?? new Date()).toISOString(),
    includesDrafts: src.includeDrafts,
    settings: {
      footerText: src.settings?.footer_text ?? null,
      logoYear: src.settings?.logo_year ?? "26",
    },
    pmId: pm?.id ?? null,
    parties,
    people,
    questions: questions.map((q) => ({
      id: q.id,
      number: q.number,
      title: q.title,
      subtitle: q.subtitle,
      kind: q.kind,
      sign: q.sign,
    })),
    weeks: liveWeeks,
  };
}
