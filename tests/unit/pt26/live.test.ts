import { describe, expect, it } from "vitest";
import { buildLivePayload, computeDelta, computeSaldo, findPreviousQuadro, type LiveSource } from "@lib/pt26/live";
import { mediaBaseUrl } from "@lib/pt26/media";
import type { QuadroRow, ResultRow, WeekRow } from "@lib/pt26/types";
import { PARTIES, PEOPLE, QUESTIONS, partyId, personId } from "./fixtures";

const q = (n: number) => QUESTIONS[n - 1];

interface WeekSpec {
  id: string;
  date: string;
  status?: WeekRow["status"];
  quadros: { question: number; idx: number; title?: string; person?: string; items: [string, number][] }[];
}

function source(weeks: WeekSpec[], includeDrafts = false): LiveSource {
  const weekRows: WeekRow[] = [];
  const quadros: QuadroRow[] = [];
  const results: ResultRow[] = [];
  let qn = 0;
  for (const w of weeks) {
    weekRows.push({ id: w.id, date: w.date, label: `Semana ${w.id}`, status: w.status ?? "PUBLISHED", source_file_name: null, imported_at: null, published_at: null });
    for (const qd of w.quadros) {
      const quadroId = `${w.id}-q${++qn}`;
      quadros.push({ id: quadroId, week_id: w.id, question_id: q(qd.question).id, idx: qd.idx, title: qd.title ?? null, person_id: qd.person ? personId(qd.person) : null });
      qd.items.forEach(([key, value], i) => {
        const party = PARTIES.find((p) => p.acronym === key);
        const person = PEOPLE.find((p) => p.name === key);
        results.push({ id: `${quadroId}-r${i}`, quadro_id: quadroId, item_key: key, value: String(value), person_id: person?.id ?? null, party_id: party?.id ?? null, sort_order: i });
      });
    }
  }
  return {
    settings: { live_token: "t", footer_text: "Sondagem X · n=1000", logo_year: "26" },
    parties: PARTIES,
    people: PEOPLE.map((p) => (p.name === "Luís Neves" ? { ...p, photo_path: "people/ln/abc" } : p)),
    questions: QUESTIONS,
    weeks: weekRows,
    quadros,
    results,
    mediaBase: mediaBaseUrl("https://x.supabase.co/"),
    includeDrafts,
    now: new Date("2026-09-08T12:00:00Z"),
  };
}

describe("computeDelta / computeSaldo", () => {
  it("variação arredondada e null na primeira semana", () => {
    expect(computeDelta(27.9, 27.4)).toBe(0.5);
    expect(computeDelta(0.3, 0.1)).toBe(0.2);
    expect(computeDelta(27.9, null)).toBeNull();
    expect(computeDelta(27.9, undefined)).toBeNull();
    expect(computeDelta(-37.7, -36.2)).toBe(-1.5);
  });
  it("saldo = aprova − desaprova", () => {
    expect(computeSaldo([{ key: "APROVA", value: 35 }, { key: "DESAPROVA", value: 58 }, { key: "NS/NR", value: 7 }])).toBe(-23);
    expect(computeSaldo([{ key: "SIM", value: 62 }])).toBeNull();
  });
});

describe("findPreviousQuadro", () => {
  const prev = [
    { idx: 1, title: null, personId: "A", items: [], saldo: null },
    { idx: 2, title: null, personId: "B", items: [], saldo: null },
  ];
  it("MINISTER segue a pessoa mesmo que a ordem mude", () => {
    expect(findPreviousQuadro({ idx: 1, personId: "B" }, "MINISTER", prev)?.idx).toBe(2);
    expect(findPreviousQuadro({ idx: 1, personId: "C" }, "MINISTER", prev)).toBeNull();
  });
  it("restantes tipos seguem o índice", () => {
    expect(findPreviousQuadro({ idx: 2, personId: null }, "PARTY", prev)?.personId).toBe("B");
    expect(findPreviousQuadro({ idx: 3, personId: null }, "PARTY", prev)).toBeNull();
  });
});

describe("buildLivePayload", () => {
  const weeks: WeekSpec[] = [
    {
      id: "w2",
      date: "2026-09-07",
      quadros: [
        { question: 1, idx: 1, title: "Três primeiros", items: [["PS", 27.9], ["CHEGA", 27.1], ["AD", 25.7]] },
        { question: 2, idx: 1, items: [["APROVA", 35], ["DESAPROVA", 58], ["NS/NR", 7]] },
        { question: 3, idx: 1, items: [["APROVA", 35], ["DESAPROVA", 59], ["NS/NR", 6]] },
        // ordem dos ministros trocada face à semana anterior
        { question: 6, idx: 1, person: "Fernando Alexandre", items: [["SIM", 49], ["NÃO", 47], ["NS/NR", 4]] },
        { question: 6, idx: 2, person: "Luís Neves", items: [["SIM", 28], ["NÃO", 65], ["NS/NR", 7]] },
        { question: 8, idx: 1, items: [["Ana Paula Martins", -37.7], ["Luís Neves", -32.1], ["Novo Ministro", -10]] },
      ],
    },
    {
      id: "w1",
      date: "2026-08-31",
      quadros: [
        { question: 1, idx: 1, title: "Três primeiros", items: [["PS", 27.4], ["CHEGA", 27.6], ["AD", 25.2]] },
        { question: 2, idx: 1, items: [["APROVA", 37], ["DESAPROVA", 56], ["NS/NR", 7]] },
        { question: 3, idx: 1, items: [["APROVA", 36], ["DESAPROVA", 57], ["NS/NR", 7]] },
        { question: 6, idx: 1, person: "Luís Neves", items: [["SIM", 30], ["NÃO", 62], ["NS/NR", 8]] },
        { question: 6, idx: 2, person: "Fernando Alexandre", items: [["SIM", 47], ["NÃO", 48], ["NS/NR", 5]] },
        { question: 8, idx: 1, items: [["Ana Paula Martins", -36.2], ["Luís Neves", -30.5], ["Fernando Alexandre", -15.9]] },
      ],
    },
    { id: "w0", date: "2026-08-24", status: "DRAFT", quadros: [{ question: 2, idx: 1, items: [["APROVA", 38], ["DESAPROVA", 54], ["NS/NR", 8]] }] },
  ];

  const payload = buildLivePayload(source(weeks));
  const [first, second] = payload.weeks;
  const question = (w: typeof first, n: number) => w.questions.find((x) => x.questionNumber === n)!;

  it("só semanas publicadas, ordenadas por data, com datas PT", () => {
    expect(payload.includesDrafts).toBe(false);
    expect(payload.weeks.map((w) => w.date)).toEqual(["2026-08-31", "2026-09-07"]);
    expect(second.dateLabel).toBe("7 Set 2026");
    expect(second.shortDate).toBe("7 Set");
    expect(payload.questions.map((x) => x.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(payload.settings).toEqual({ footerText: "Sondagem X · n=1000", logoYear: "26" });
  });

  it("primeira semana sem variação; segunda com deltas por item", () => {
    const p1First = question(first, 1).quadros[0].items;
    expect(p1First.map((i) => i.delta)).toEqual([null, null, null]);
    const p1Second = question(second, 1).quadros[0].items;
    expect(p1Second.map((i) => [i.key, i.value, i.delta])).toEqual([["PS", 27.9, 0.5], ["CHEGA", 27.1, -0.5], ["AD", 25.7, 0.5]]);
    expect(p1Second[0].partyId).toBe(partyId("PS"));
  });

  it("APPROVAL inclui saldo e variação do saldo", () => {
    expect(question(first, 2).quadros[0].saldo).toEqual({ value: -19, delta: null });
    expect(question(second, 2).quadros[0].saldo).toEqual({ value: -23, delta: -4 });
    expect(question(second, 2).quadros[0].items.find((i) => i.key === "APROVA")?.delta).toBe(-2);
  });

  it("P3 recebe a cara do Primeiro-Ministro", () => {
    expect(question(second, 3).quadros[0].personId).toBe(personId("Luís Montenegro"));
    expect(question(second, 2).quadros[0].personId).toBeNull();
    expect(payload.pmId).toBe(personId("Luís Montenegro"));
  });

  it("MINISTER: variação segue a pessoa, não a posição do quadro", () => {
    const p6 = question(second, 6).quadros;
    expect(p6[0].personId).toBe(personId("Fernando Alexandre"));
    expect(p6[0].items.map((i) => [i.key, i.delta])).toEqual([["SIM", 2], ["NÃO", -1], ["NS/NR", -1]]);
    expect(p6[1].personId).toBe(personId("Luís Neves"));
    expect(p6[1].items.map((i) => i.delta)).toEqual([-2, 3, -1]);
  });

  it("RANKING: item novo fica sem variação; pessoas emparelhadas por id", () => {
    const p8 = question(second, 8).quadros[0].items;
    expect(p8.map((i) => [i.key, i.delta])).toEqual([["Ana Paula Martins", -1.5], ["Luís Neves", -1.6], ["Novo Ministro", null]]);
    expect(p8[2].personId).toBeNull();
  });

  it("perguntas sem dados nessa semana ficam com lista de quadros vazia", () => {
    expect(question(second, 4).quadros).toEqual([]);
  });

  it("partidos com líder e pessoas com URLs de foto (256/800 webp)", () => {
    expect(payload.parties[partyId("PS")].leaderId).toBe(personId("José Luís Carneiro"));
    expect(payload.parties[partyId("AD")].leaderId).toBe(personId("Luís Montenegro")); // PM como líder
    expect(payload.parties[partyId("IL")].leaderId).toBeNull();
    expect(payload.people[personId("Luís Neves")].photo).toEqual({
      small: "https://x.supabase.co/storage/v1/object/public/pt26/people/ln/abc-256.webp",
      large: "https://x.supabase.co/storage/v1/object/public/pt26/people/ln/abc-800.webp",
    });
    expect(payload.people[personId("Paulo Rangel")].photo).toBeNull();
  });

  it("modo preview inclui DRAFT e recalcula as variações com essa semana", () => {
    const preview = buildLivePayload(source(weeks, true));
    expect(preview.weeks.map((w) => [w.date, w.status])).toEqual([
      ["2026-08-24", "DRAFT"],
      ["2026-08-31", "PUBLISHED"],
      ["2026-09-07", "PUBLISHED"],
    ]);
    // Com a semana de 24 Ago incluída, 31 Ago passa a ter variação na P2
    const aug31 = preview.weeks[1].questions.find((x) => x.questionNumber === 2)!.quadros[0];
    expect(aug31.saldo).toEqual({ value: -19, delta: -3 });
  });
});
