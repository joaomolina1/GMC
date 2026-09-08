import { describe, expect, it } from "vitest";
import { buildHistory } from "@lib/pt26/history";
import { buildLivePayload, type LiveSource } from "@lib/pt26/live";
import type { QuadroRow, ResultRow, WeekRow } from "@lib/pt26/types";
import { PARTIES, PEOPLE, QUESTIONS, personId } from "./fixtures";

const q = (n: number) => QUESTIONS[n - 1];

function payloadFor(weeks: { id: string; date: string; quadros: { question: number; idx: number; person?: string; items: [string, number][] }[] }[]) {
  const weekRows: WeekRow[] = [];
  const quadros: QuadroRow[] = [];
  const results: ResultRow[] = [];
  let n = 0;
  for (const w of weeks) {
    weekRows.push({ id: w.id, date: w.date, label: w.id, status: "PUBLISHED", source_file_name: null, imported_at: null, published_at: null });
    for (const qd of w.quadros) {
      const id = `${w.id}-${++n}`;
      quadros.push({ id, week_id: w.id, question_id: q(qd.question).id, idx: qd.idx, title: null, person_id: qd.person ? personId(qd.person) : null });
      qd.items.forEach(([key, value], i) =>
        results.push({
          id: `${id}-${i}`,
          quadro_id: id,
          item_key: key,
          value,
          person_id: PEOPLE.find((p) => p.name === key)?.id ?? null,
          party_id: PARTIES.find((p) => p.acronym === key)?.id ?? null,
          sort_order: i,
        })
      );
    }
  }
  const src: LiveSource = { settings: null, parties: PARTIES, people: PEOPLE, questions: QUESTIONS, weeks: weekRows, quadros, results, mediaBase: "https://m", includeDrafts: false };
  return buildLivePayload(src);
}

const payload = payloadFor([
  {
    id: "w1",
    date: "2026-08-24",
    quadros: [
      { question: 1, idx: 1, items: [["PS", 26.8], ["CHEGA", 28.1], ["AD", 25.0]] },
      { question: 1, idx: 2, items: [["IL", 6.4], ["LIVRE", 3.9]] },
      { question: 2, idx: 1, items: [["APROVA", 38], ["DESAPROVA", 54], ["NS/NR", 8]] },
      { question: 6, idx: 1, person: "Luís Neves", items: [["SIM", 33], ["NÃO", 59], ["NS/NR", 8]] },
    ],
  },
  {
    id: "w2",
    date: "2026-08-31",
    quadros: [
      { question: 1, idx: 1, items: [["PS", 27.4], ["CHEGA", 27.6], ["AD", 25.2]] },
      { question: 1, idx: 2, items: [["IL", 6.3], ["LIVRE", 4.1]] },
      { question: 2, idx: 1, items: [["APROVA", 37], ["DESAPROVA", 56], ["NS/NR", 7]] },
      { question: 6, idx: 1, person: "Fernando Alexandre", items: [["SIM", 47], ["NÃO", 48], ["NS/NR", 5]] },
      { question: 6, idx: 2, person: "Luís Neves", items: [["SIM", 30], ["NÃO", 62], ["NS/NR", 8]] },
    ],
  },
  {
    id: "w3",
    date: "2026-09-07",
    quadros: [
      { question: 1, idx: 1, items: [["PS", 27.9], ["CHEGA", 27.1], ["AD", 25.7]] },
      { question: 1, idx: 2, items: [["IL", 6.1], ["LIVRE", 4]] },
      { question: 2, idx: 1, items: [["APROVA", 35], ["DESAPROVA", 58], ["NS/NR", 7]] },
      { question: 6, idx: 1, person: "Luís Neves", items: [["SIM", 28], ["NÃO", 65], ["NS/NR", 7]] },
    ],
  },
]);

const quadroOf = (weekIdx: number, question: number, idx: number) =>
  payload.weeks[weekIdx].questions.find((x) => x.questionNumber === question)!.quadros.find((x) => x.idx === idx)!;

describe("buildHistory", () => {
  it("inclui só as semanas até à selecionada, inclusive", () => {
    const h = buildHistory(payload, 1, quadroOf(1, 1, 1), 1);
    expect(h.weeks.map((w) => w.date)).toEqual(["2026-08-24", "2026-08-31"]);
    expect(h.series.map((s) => s.label)).toEqual(["PS", "CHEGA", "AD"]);
    expect(h.series[0].values).toEqual([26.8, 27.4]);
    expect(h.series[0].color).toBe("#f0568f");
  });

  it("segue o quadro ativo (P1 quadro 2 → só os restantes partidos)", () => {
    const h = buildHistory(payload, 1, quadroOf(2, 1, 2), 2);
    expect(h.series.map((s) => s.label)).toEqual(["IL", "LIVRE"]);
    expect(h.series[1].values).toEqual([3.9, 4.1, 4]);
  });

  it("APPROVAL inclui a linha do saldo sem unidade", () => {
    const h = buildHistory(payload, 2, quadroOf(2, 2, 1), 2);
    expect(h.series.map((s) => [s.label, s.unit])).toEqual([["Aprova", "%"], ["Desaprova", "%"], ["Saldo", ""]]);
    expect(h.series[2].values).toEqual([-16, -19, -23]);
  });

  it("MINISTER segue a pessoa entre semanas mesmo com o índice do quadro a mudar", () => {
    const h = buildHistory(payload, 6, quadroOf(2, 6, 1), 2); // Luís Neves (idx 1 em w3, idx 2 em w2, idx 1 em w1)
    expect(h.series.map((s) => s.label)).toEqual(["Sim", "Não"]);
    expect(h.series[0].values).toEqual([33, 30, 28]);
    expect(h.series[1].values).toEqual([59, 62, 65]);
  });

  it("primeira semana: um único ponto", () => {
    const h = buildHistory(payload, 1, quadroOf(0, 1, 1), 0);
    expect(h.weeks).toHaveLength(1);
    expect(h.series[0].values).toEqual([26.8]);
  });

  it("semanas sem o item ficam a null (linha interrompida)", () => {
    const h = buildHistory(payload, 6, quadroOf(1, 6, 1), 1); // Fernando Alexandre só existe em w2
    expect(h.series[0].values).toEqual([null, 47]);
  });
});
