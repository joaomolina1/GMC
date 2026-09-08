import type { PartyRow, PersonRow, QuestionRow } from "@lib/pt26/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const QUESTIONS: QuestionRow[] = [
  { id: uuid(101), number: 1, title: "Intenção de voto", subtitle: null, kind: "PARTY", sign: 1, sort_order: 1 },
  { id: uuid(102), number: 2, title: "Taxa de aprovação do Governo", subtitle: null, kind: "APPROVAL", sign: 1, sort_order: 2 },
  { id: uuid(103), number: 3, title: "Taxa de aprovação do Primeiro-Ministro", subtitle: null, kind: "APPROVAL", sign: 1, sort_order: 3 },
  { id: uuid(104), number: 4, title: "O Governo chega ao fim da legislatura?", subtitle: null, kind: "YESNO", sign: 1, sort_order: 4 },
  { id: uuid(105), number: 5, title: "O Governo merece chegar ao fim da legislatura?", subtitle: null, kind: "YESNO", sign: 1, sort_order: 5 },
  { id: uuid(106), number: 6, title: "Avaliação do Governo", subtitle: "Tem condições para continuar?", kind: "MINISTER", sign: 1, sort_order: 6 },
  { id: uuid(107), number: 7, title: "Melhores ministros", subtitle: null, kind: "RANKING", sign: 1, sort_order: 7 },
  { id: uuid(108), number: 8, title: "Piores ministros", subtitle: null, kind: "RANKING", sign: -1, sort_order: 8 },
];

const party = (n: number, acronym: string, name: string, color: string): PartyRow => ({
  id: uuid(200 + n),
  acronym,
  name,
  color,
  logo_path: null,
  sort_order: n,
});

export const PARTIES: PartyRow[] = [
  party(1, "PS", "Partido Socialista", "#f0568f"),
  party(2, "CHEGA", "Chega", "#5b8cff"),
  party(3, "AD", "Aliança Democrática", "#ff8a1f"),
  party(4, "IL", "Iniciativa Liberal", "#22c8f5"),
  party(5, "LIVRE", "Livre", "#b9e04a"),
  party(6, "CDU", "Coligação Democrática Unitária", "#e63535"),
  party(7, "BE", "Bloco de Esquerda", "#c2185b"),
  party(8, "PAN", "Pessoas–Animais–Natureza", "#2fc9a8"),
  party(9, "O/B/N", "Outros, brancos e nulos", "#8f98b4"),
];

export const partyId = (acronym: string) => PARTIES.find((p) => p.acronym === acronym)!.id;

const person = (n: number, name: string, role: string, kind: PersonRow["kind"], partyAcronym: string | null, aliases: string[] = []): PersonRow => ({
  id: uuid(300 + n),
  name,
  role,
  kind,
  party_id: partyAcronym ? partyId(partyAcronym) : null,
  photo_path: null,
  aliases,
});

export const PEOPLE: PersonRow[] = [
  person(1, "Luís Montenegro", "Primeiro-Ministro", "PM", "AD"),
  person(2, "Luís Neves", "Ministro da Administração Interna", "MINISTER", null),
  person(3, "Fernando Alexandre", "Ministro da Educação", "MINISTER", null),
  person(4, "Miranda Sarmento", "Ministro das Finanças", "MINISTER", null, ["Joaquim Miranda Sarmento"]),
  person(5, "Maria da Graça Carvalho", "Ministra do Ambiente e Energia", "MINISTER", null, ["Graça Carvalho"]),
  person(6, "Paulo Rangel", "Ministro dos Negócios Estrangeiros", "MINISTER", null),
  person(7, "Ana Paula Martins", "Ministra da Saúde", "MINISTER", null),
  person(8, "José Luís Carneiro", "Líder · PS", "LEADER", "PS"),
  person(9, "André Ventura", "Líder · CHEGA", "LEADER", "CHEGA"),
];

export const personId = (name: string) => PEOPLE.find((p) => p.name === name)!.id;
