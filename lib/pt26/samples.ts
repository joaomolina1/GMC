/**
 * Dados de exemplo — três semanas de tracking poll. A semana 2026-09-07 tem exatamente os
 * valores do caderno de requisitos; as anteriores variam ligeiramente para o histórico ter 3 pontos.
 * Usados por `scripts/pt26/make-samples.ts` (gera samples/pt26/*.xlsx) e pelos testes.
 */

export interface SampleQuadro {
  idx: number;
  title?: string;
  person?: string;
  items: [string, number][];
}

export interface SampleWeek {
  date: string;
  label: string;
  questions: Record<number, SampleQuadro[]>;
}

const yn = (s: number, n: number, x: number): [string, number][] => [
  ["SIM", s],
  ["NÃO", n],
  ["NS/NR", x],
];
const ap = (a: number, d: number, x: number): [string, number][] => [
  ["APROVA", a],
  ["DESAPROVA", d],
  ["NS/NR", x],
];

export const SAMPLE_WEEKS: SampleWeek[] = [
  {
    date: "2026-08-24",
    label: "Semana 6",
    questions: {
      1: [
        { idx: 1, title: "Três primeiros", items: [["PS", 26.8], ["CHEGA", 28.1], ["AD", 25.0]] },
        { idx: 2, title: "Restantes partidos", items: [["IL", 6.4], ["LIVRE", 3.9], ["CDU", 2.6], ["BE", 2.3], ["PAN", 1.3], ["O/B/N", 3.6]] },
      ],
      2: [{ idx: 1, items: ap(38, 54, 8) }],
      3: [{ idx: 1, items: ap(37, 55, 8) }],
      4: [{ idx: 1, items: yn(58, 35, 7) }],
      5: [{ idx: 1, items: yn(50, 44, 6) }],
      6: [
        { idx: 1, person: "Luís Neves", items: yn(33, 59, 8) },
        { idx: 2, person: "Fernando Alexandre", items: yn(45, 49, 6) },
      ],
      7: [{ idx: 1, items: [["Miranda Sarmento", 8.2], ["Maria da Graça Carvalho", 9.0], ["Paulo Rangel", 4.8]] }],
      8: [{ idx: 1, items: [["Ana Paula Martins", -34.9], ["Luís Neves", -29.8], ["Fernando Alexandre", -16.4]] }],
    },
  },
  {
    date: "2026-08-31",
    label: "Semana 7",
    questions: {
      1: [
        { idx: 1, title: "Três primeiros", items: [["PS", 27.4], ["CHEGA", 27.6], ["AD", 25.2]] },
        { idx: 2, title: "Restantes partidos", items: [["IL", 6.3], ["LIVRE", 4.1], ["CDU", 2.5], ["BE", 2.1], ["PAN", 1.4], ["O/B/N", 3.4]] },
      ],
      2: [{ idx: 1, items: ap(37, 56, 7) }],
      3: [{ idx: 1, items: ap(36, 57, 7) }],
      4: [{ idx: 1, items: yn(60, 34, 6) }],
      5: [{ idx: 1, items: yn(51, 43, 6) }],
      6: [
        { idx: 1, person: "Luís Neves", items: yn(30, 62, 8) },
        { idx: 2, person: "Fernando Alexandre", items: yn(47, 48, 5) },
      ],
      7: [{ idx: 1, items: [["Miranda Sarmento", 8.6], ["Maria da Graça Carvalho", 9.4], ["Paulo Rangel", 4.2]] }],
      8: [{ idx: 1, items: [["Ana Paula Martins", -36.2], ["Luís Neves", -30.5], ["Fernando Alexandre", -15.9]] }],
    },
  },
  {
    date: "2026-09-07",
    label: "Semana 8",
    questions: {
      1: [
        { idx: 1, title: "Três primeiros", items: [["PS", 27.9], ["CHEGA", 27.1], ["AD", 25.7]] },
        { idx: 2, title: "Restantes partidos", items: [["IL", 6.1], ["LIVRE", 4], ["CDU", 2.4], ["BE", 2.2], ["PAN", 1.3], ["O/B/N", 3.3]] },
      ],
      2: [{ idx: 1, items: ap(35, 58, 7) }],
      3: [{ idx: 1, items: ap(35, 59, 6) }],
      4: [{ idx: 1, items: yn(62, 32, 6) }],
      5: [{ idx: 1, items: yn(53, 42, 5) }],
      6: [
        { idx: 1, person: "Luís Neves", items: yn(28, 65, 7) },
        { idx: 2, person: "Fernando Alexandre", items: yn(49, 47, 4) },
      ],
      7: [{ idx: 1, items: [["Miranda Sarmento", 9.1], ["Maria da Graça Carvalho", 9.1], ["Paulo Rangel", 4.6]] }],
      8: [{ idx: 1, items: [["Ana Paula Martins", -37.7], ["Luís Neves", -32.1], ["Fernando Alexandre", -14.8]] }],
    },
  },
];

/** Sheets (P1…P8 + META) no formato AOA para `buildWorkbookFromValues`. */
export function sampleWorkbookSheets(week: SampleWeek): Record<string, (string | number | null)[][]> {
  const sheets: Record<string, (string | number | null)[][]> = {};
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const rows: (string | number | null)[][] = [["Quadro", "Pessoa", "Item", "Valor", "Titulo"]];
    for (const quadro of week.questions[n] ?? []) {
      quadro.items.forEach(([item, value], i) => {
        rows.push([quadro.idx, i === 0 ? (quadro.person ?? "") : "", item, value, i === 0 ? (quadro.title ?? "") : ""]);
      });
    }
    sheets[`P${n}`] = rows;
  }
  sheets.META = [["Data", week.date]];
  return sheets;
}

export function sampleFileName(week: SampleWeek): string {
  return `semana-${week.date}.xlsx`;
}
