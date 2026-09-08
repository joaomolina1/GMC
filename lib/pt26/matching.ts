import { canonicalAnswer, normalizeText } from "./normalize";
import type { PartyRow, PersonRow, QuestionKind } from "./types";

export interface ItemMatch {
  /** Chave canónica a guardar: sigla do partido, nome oficial da pessoa, resposta canónica ou o texto original. */
  key: string;
  partyId: string | null;
  personId: string | null;
  kind: "party" | "person" | "answer" | "none";
}

export interface Matcher {
  matchItem(raw: string, questionKind: QuestionKind): ItemMatch;
  matchPerson(raw: string): PersonRow | null;
  matchParty(raw: string): PartyRow | null;
}

/**
 * Índice de correspondência case-insensitive e sem acentos:
 * partidos por sigla/nome, pessoas por nome/aliases.
 */
export function buildMatcher(parties: PartyRow[], people: PersonRow[]): Matcher {
  const partyIndex = new Map<string, PartyRow>();
  for (const p of parties) {
    partyIndex.set(normalizeText(p.acronym), p);
    partyIndex.set(normalizeText(p.acronym).replace(/[/\s.-]/g, ""), p);
    if (p.name) partyIndex.set(normalizeText(p.name), p);
  }
  const personIndex = new Map<string, PersonRow>();
  for (const person of people) {
    personIndex.set(normalizeText(person.name), person);
    for (const alias of person.aliases ?? []) {
      const key = normalizeText(alias);
      if (key && !personIndex.has(key)) personIndex.set(key, person);
    }
  }

  const matchParty = (raw: string) => {
    const n = normalizeText(raw);
    return partyIndex.get(n) ?? partyIndex.get(n.replace(/[/\s.-]/g, "")) ?? null;
  };
  const matchPerson = (raw: string) => personIndex.get(normalizeText(raw)) ?? null;

  return {
    matchParty,
    matchPerson,
    matchItem(raw, questionKind) {
      const answer = canonicalAnswer(raw);
      if (answer && questionKind !== "PARTY" && questionKind !== "RANKING") {
        return { key: answer, partyId: null, personId: null, kind: "answer" };
      }
      // Partidos primeiro na intenção de voto; pessoas primeiro nos rankings.
      const order: ("party" | "person")[] = questionKind === "PARTY" ? ["party", "person"] : ["person", "party"];
      for (const step of order) {
        if (step === "party") {
          const party = matchParty(raw);
          if (party) return { key: party.acronym, partyId: party.id, personId: null, kind: "party" };
        } else {
          const person = matchPerson(raw);
          if (person) return { key: person.name, partyId: null, personId: person.id, kind: "person" };
        }
      }
      if (answer) return { key: answer, partyId: null, personId: null, kind: "answer" };
      return { key: raw.trim(), partyId: null, personId: null, kind: "none" };
    },
  };
}
