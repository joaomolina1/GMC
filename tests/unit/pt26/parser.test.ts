import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildTemplateWorkbook,
  buildWorkbookFromValues,
  defaultTemplateQuestions,
  parseWorkbook,
  toReplaceWeekPayload,
} from "@lib/pt26/excel";
import { buildMatcher } from "@lib/pt26/matching";
import { SAMPLE_WEEKS, sampleWorkbookSheets } from "@lib/pt26/samples";
import { PARTIES, PEOPLE, QUESTIONS, partyId, personId } from "./fixtures";

const ctx = { questions: QUESTIONS, matcher: buildMatcher(PARTIES, PEOPLE) };
type Rows = (string | number | null)[][];
const H: Rows[number] = ["Quadro", "Pessoa", "Item", "Valor", "Titulo"];

/** Livro válido com todas as sheets; `over` substitui sheets individuais. */
function workbook(over: Record<string, Rows> = {}, drop: string[] = []) {
  const base = sampleWorkbookSheets(SAMPLE_WEEKS[2]);
  const sheets: Record<string, Rows> = { ...base, ...over };
  for (const d of drop) delete sheets[d];
  return buildWorkbookFromValues(sheets);
}

const errors = (r: ReturnType<typeof parseWorkbook>) => r.issues.filter((i) => i.level === "error");
const warnings = (r: ReturnType<typeof parseWorkbook>) => r.issues.filter((i) => i.level === "warning");

describe("parseWorkbook — semana de exemplo", () => {
  const parsed = parseWorkbook(workbook(), ctx);

  it("lê as 8 perguntas sem erros nem avisos", () => {
    expect(errors(parsed)).toEqual([]);
    expect(warnings(parsed)).toEqual([]);
    expect(parsed.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parsed.metaDate).toBe("2026-09-07");
  });

  it("P1: dois quadros com título, partidos emparelhados e valores exatos", () => {
    const p1 = parsed.questions[0];
    expect(p1.quadros).toHaveLength(2);
    expect(p1.quadros[0].title).toBe("Três primeiros");
    expect(p1.quadros[0].items.map((i) => [i.key, i.value])).toEqual([["PS", 27.9], ["CHEGA", 27.1], ["AD", 25.7]]);
    expect(p1.quadros[0].items[0].partyId).toBe(partyId("PS"));
    expect(p1.quadros[1].title).toBe("Restantes partidos");
    expect(p1.quadros[1].items.map((i) => i.key)).toEqual(["IL", "LIVRE", "CDU", "BE", "PAN", "O/B/N"]);
    expect(p1.quadros[1].items.at(-1)?.partyId).toBe(partyId("O/B/N"));
    expect(p1.quadros[1].items.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("P2–P5: respostas canónicas", () => {
    expect(parsed.questions[1].quadros[0].items.map((i) => [i.key, i.value])).toEqual([["APROVA", 35], ["DESAPROVA", 58], ["NS/NR", 7]]);
    expect(parsed.questions[3].quadros[0].items.map((i) => [i.key, i.value])).toEqual([["SIM", 62], ["NÃO", 32], ["NS/NR", 6]]);
    expect(parsed.questions[3].quadros[0].items.every((i) => i.matched)).toBe(true);
  });

  it("P6: um quadro por ministro com a pessoa emparelhada", () => {
    const p6 = parsed.questions[5];
    expect(p6.quadros.map((q) => [q.idx, q.personName, q.personId])).toEqual([
      [1, "Luís Neves", personId("Luís Neves")],
      [2, "Fernando Alexandre", personId("Fernando Alexandre")],
    ]);
    expect(p6.quadros[1].items.map((i) => i.value)).toEqual([49, 47, 4]);
  });

  it("P7/P8: pessoas emparelhadas e negativos", () => {
    const p7 = parsed.questions[6].quadros[0];
    expect(p7.items.map((i) => [i.key, i.value, i.personId])).toEqual([
      ["Miranda Sarmento", 9.1, personId("Miranda Sarmento")],
      ["Maria da Graça Carvalho", 9.1, personId("Maria da Graça Carvalho")],
      ["Paulo Rangel", 4.6, personId("Paulo Rangel")],
    ]);
    const p8 = parsed.questions[7].quadros[0];
    expect(p8.items.map((i) => i.value)).toEqual([-37.7, -32.1, -14.8]);
  });

  it("gera o payload da RPC com uma entrada por quadro", () => {
    const payload = toReplaceWeekPayload(parsed, { date: "2026-09-07", label: "Semana 8", sourceFileName: "semana.xlsx" });
    expect(payload.date).toBe("2026-09-07");
    expect(payload.quadros).toHaveLength(10); // 2 + 1 + 1 + 1 + 1 + 2 + 1 + 1
    const p6 = payload.quadros.filter((q) => q.question_number === 6);
    expect(p6[0].person_id).toBe(personId("Luís Neves"));
    expect(p6[0].results[1]).toEqual({ item_key: "NÃO", value: 65, person_id: null, party_id: null, sort_order: 1 });
  });
});

describe("parseWorkbook — formatos de valor e nomes", () => {
  it("aceita vírgula, ponto, % e sinais menos tipográficos", () => {
    const parsed = parseWorkbook(
      workbook({
        P1: [H, [1, "", "PS", "27,9", "Três primeiros"], ["", "", "CHEGA", "27.1", ""], ["", "", "AD", "25,7 %", ""], [2, "", "IL", "6,1%", "Restantes"], ["", "", "LIVRE", 4, ""], ["", "", "CDU", "2,4", ""], ["", "", "BE", "2,2", ""], ["", "", "PAN", "1,3", ""], ["", "", "O/B/N", "3,3", ""]],
        P8: [H, [1, "", "Ana Paula Martins", "−37,7", ""], ["", "", "Luís Neves", "-32.1", ""], ["", "", "Fernando Alexandre", "–14,8", ""]],
      }),
      ctx
    );
    expect(errors(parsed)).toEqual([]);
    expect(parsed.questions[0].quadros[0].items.map((i) => i.value)).toEqual([27.9, 27.1, 25.7]);
    expect(parsed.questions[0].quadros[1].items.map((i) => i.value)).toEqual([6.1, 4, 2.4, 2.2, 1.3, 3.3]);
    expect(parsed.questions[7].quadros[0].items.map((i) => i.value)).toEqual([-37.7, -32.1, -14.8]);
  });

  it("Quadro em branco herda o quadro anterior (default 1)", () => {
    const parsed = parseWorkbook(
      workbook({
        P6: [H, ["", "Luís Neves", "SIM", 28, ""], ["", "", "NÃO", 65, ""], ["", "", "NS/NR", 7, ""], [2, "Fernando Alexandre", "SIM", 49, ""], ["", "", "NÃO", 47, ""], ["", "", "NS/NR", 4, ""]],
      }),
      ctx
    );
    expect(errors(parsed)).toEqual([]);
    expect(parsed.questions[5].quadros.map((q) => [q.idx, q.items.length])).toEqual([[1, 3], [2, 3]]);
  });

  it("emparelha aliases e nomes sem acentos/caixa", () => {
    const parsed = parseWorkbook(
      workbook({
        P7: [H, [1, "", "Joaquim Miranda Sarmento", 9.1, ""], ["", "", "GRAÇA CARVALHO", 9.1, ""], ["", "", "paulo rangel", 4.6, ""]],
        P1: [H, [1, "", "ps", 27.9, ""], ["", "", "Chega", 27.1, ""], ["", "", "ad", 25.7, ""], [2, "", "il", 6.1, ""], ["", "", "Livre", 4, ""], ["", "", "cdu", 2.4, ""], ["", "", "be", 2.2, ""], ["", "", "pan", 1.3, ""], ["", "", "O/B/N", 3.3, ""]],
      }),
      ctx
    );
    expect(errors(parsed)).toEqual([]);
    const p7 = parsed.questions[6].quadros[0].items;
    expect(p7.map((i) => i.key)).toEqual(["Miranda Sarmento", "Maria da Graça Carvalho", "Paulo Rangel"]);
    expect(p7[0].personId).toBe(personId("Miranda Sarmento"));
    expect(parsed.questions[0].quadros[0].items.map((i) => i.key)).toEqual(["PS", "CHEGA", "AD"]);
  });

  it("aceita sheets com nomes alternativos («Pergunta 1», «1», «q3», «P 4»)", () => {
    const base = sampleWorkbookSheets(SAMPLE_WEEKS[2]);
    const renamed: Record<string, Rows> = {
      "Pergunta 1": base.P1,
      "2": base.P2,
      q3: base.P3,
      "P 4": base.P4,
      "P5 - Merece": base.P5,
      Pergunta6: base.P6,
      P7: base.P7,
      p8: base.P8,
      META: base.META,
    };
    const parsed = parseWorkbook(buildWorkbookFromValues(renamed), ctx);
    expect(errors(parsed)).toEqual([]);
    expect(parsed.questions.map((q) => q.sheet)).toEqual(["Pergunta 1", "2", "q3", "P 4", "P5 - Merece", "Pergunta6", "P7", "p8"]);
  });

  it("aceita cabeçalhos com acento e caixa diferente", () => {
    const parsed = parseWorkbook(workbook({ P2: [["QUADRO", "pessoa", "ITEM", "valor", "Título"], [1, "", "Aprova", 35, "Governo"], ["", "", "Desaprova", 58, ""], ["", "", "NS/NR", 7, ""]] }), ctx);
    expect(errors(parsed)).toEqual([]);
    expect(parsed.questions[1].quadros[0].title).toBe("Governo");
  });
});

describe("parseWorkbook — validações bloqueantes", () => {
  it("sheet em falta", () => {
    const parsed = parseWorkbook(workbook({}, ["P4"]), ctx);
    expect(errors(parsed).map((e) => e.code)).toContain("sheet_missing");
    expect(parsed.questions[3].quadros).toEqual([]);
  });

  it("Item vazio com valor", () => {
    const parsed = parseWorkbook(workbook({ P2: [H, [1, "", "", 35, ""], ["", "", "DESAPROVA", 58, ""], ["", "", "NS/NR", 7, ""]] }), ctx);
    const codes = errors(parsed).map((e) => e.code);
    expect(codes).toContain("item_empty");
    expect(codes).toContain("answers_missing");
  });

  it("Valor não numérico", () => {
    const parsed = parseWorkbook(workbook({ P4: [H, [1, "", "SIM", "sessenta", ""], ["", "", "NÃO", 32, ""], ["", "", "NS/NR", 6, ""]] }), ctx);
    const e = errors(parsed).find((i) => i.code === "value_invalid");
    expect(e).toBeDefined();
    expect(e?.sheet).toBe("P4");
    expect(e?.row).toBe(2);
  });

  it("APPROVAL/YESNO/MINISTER sem as três respostas", () => {
    const parsed = parseWorkbook(workbook({ P3: [H, [1, "", "APROVA", 35, ""], ["", "", "DESAPROVA", 59, ""]] }), ctx);
    const e = errors(parsed).find((i) => i.code === "answers_missing");
    expect(e?.message).toContain("NS/NR");
  });

  it("item repetido no mesmo quadro e cabeçalho sem Item/Valor", () => {
    const parsed = parseWorkbook(
      workbook({
        P5: [H, [1, "", "SIM", 53, ""], ["", "", "sim", 1, ""], ["", "", "NÃO", 42, ""], ["", "", "NS/NR", 5, ""]],
        P7: [["Nome", "Pontos"], ["Miranda Sarmento", 9.1]],
      }),
      ctx
    );
    const codes = errors(parsed).map((e) => e.code);
    expect(codes).toContain("item_duplicate");
    expect(codes).toContain("header_missing");
  });
});

describe("parseWorkbook — avisos", () => {
  it("soma fora de 95–105 e item sem correspondência", () => {
    const parsed = parseWorkbook(
      workbook({
        P2: [H, [1, "", "APROVA", 35, ""], ["", "", "DESAPROVA", 40, ""], ["", "", "NS/NR", 7, ""]],
        P7: [H, [1, "", "Miranda Sarmento", 9.1, ""], ["", "", "Ministro Desconhecido", 5, ""], ["", "", "Paulo Rangel", 4.6, ""]],
      }),
      ctx
    );
    expect(errors(parsed)).toEqual([]);
    const codes = warnings(parsed).map((w) => w.code);
    expect(codes).toContain("sum_out_of_range");
    expect(codes).toContain("item_unmatched");
    const unknown = parsed.questions[6].quadros[0].items[1];
    expect(unknown.matched).toBe(false);
    expect(unknown.key).toBe("Ministro Desconhecido");
    expect(unknown.personId).toBeNull();
  });

  it("pessoa do quadro sem correspondência e quadro MINISTER sem pessoa", () => {
    const parsed = parseWorkbook(
      workbook({
        P6: [H, [1, "Ministro Fantasma", "SIM", 28, ""], ["", "", "NÃO", 65, ""], ["", "", "NS/NR", 7, ""], [2, "", "SIM", 49, ""], ["", "", "NÃO", 47, ""], ["", "", "NS/NR", 4, ""]],
      }),
      ctx
    );
    expect(errors(parsed)).toEqual([]);
    const codes = warnings(parsed).map((w) => w.code);
    expect(codes).toContain("person_unmatched");
    expect(codes).toContain("person_missing");
    expect(parsed.questions[5].quadros[0].personName).toBe("Ministro Fantasma");
    expect(parsed.questions[5].quadros[0].personId).toBeNull();
  });

  it("ranking com sinal inesperado", () => {
    const parsed = parseWorkbook(workbook({ P8: [H, [1, "", "Ana Paula Martins", 37.7, ""], ["", "", "Luís Neves", -32.1, ""], ["", "", "Fernando Alexandre", -14.8, ""]] }), ctx);
    expect(warnings(parsed).map((w) => w.code)).toContain("sign_unexpected");
  });
});

describe("template Excel", () => {
  it("gera 8 sheets P1…P8 + META com cabeçalhos e itens por defeito, que o parser reconhece", () => {
    const template = buildTemplateWorkbook(defaultTemplateQuestions(QUESTIONS, PARTIES.map((p) => p.acronym)), "2026-09-14");
    const wb = XLSX.read(template, { type: "array" });
    expect(wb.SheetNames).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "META"]);
    const p1 = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.P1, { header: 1 });
    expect(p1[0]).toEqual(["Quadro", "Pessoa", "Item", "Valor", "Titulo"]);
    expect(p1.slice(1).map((r) => r[2])).toEqual(["PS", "CHEGA", "AD", "IL", "LIVRE", "CDU", "BE", "PAN", "O/B/N"]);

    // O template sem valores dá erros de valor (esperado) mas todas as sheets são reconhecidas.
    const parsed = parseWorkbook(template, ctx);
    expect(parsed.metaDate).toBe("2026-09-14");
    expect(errors(parsed).map((e) => e.code)).not.toContain("sheet_missing");
  });
});
