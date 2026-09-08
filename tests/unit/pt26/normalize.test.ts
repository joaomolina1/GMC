import { describe, expect, it } from "vitest";
import { decimalsForKind, formatDatePt, formatNumberPt, formatSignedPt, isFlatDelta } from "@lib/pt26/format";
import {
  canonicalAnswer,
  initialsOf,
  normalizeText,
  parseExcelDate,
  parseNumber,
  questionNumberFromSheetName,
} from "@lib/pt26/normalize";

describe("normalizeText", () => {
  it("remove acentos, caixa e espaços duplicados", () => {
    expect(normalizeText("  Maria  da GRAÇA   Carvalho ")).toBe("maria da graca carvalho");
    expect(normalizeText("NÃO")).toBe("nao");
    expect(normalizeText(null)).toBe("");
  });
});

describe("parseNumber", () => {
  it("aceita vírgula, ponto, percentagem e negativos", () => {
    expect(parseNumber("27,9")).toBe(27.9);
    expect(parseNumber("27.9")).toBe(27.9);
    expect(parseNumber("35%")).toBe(35);
    expect(parseNumber(" 35 % ")).toBe(35);
    expect(parseNumber("-37,7")).toBe(-37.7);
    expect(parseNumber("−14,8")).toBe(-14.8); // sinal menos tipográfico
    expect(parseNumber("–2,4")).toBe(-2.4); // en dash
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber(62)).toBe(62);
    expect(parseNumber(0)).toBe(0);
  });
  it("rejeita texto não numérico", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("12a")).toBeNull();
    expect(parseNumber(true)).toBeNull();
  });
});

describe("canonicalAnswer", () => {
  it("normaliza as respostas fechadas", () => {
    expect(canonicalAnswer("Aprova")).toBe("APROVA");
    expect(canonicalAnswer("DESAPROVA")).toBe("DESAPROVA");
    expect(canonicalAnswer("sim")).toBe("SIM");
    expect(canonicalAnswer("Nao")).toBe("NÃO");
    expect(canonicalAnswer("NÃO")).toBe("NÃO");
    expect(canonicalAnswer("NS/NR")).toBe("NS/NR");
    expect(canonicalAnswer("ns / nr")).toBe("NS/NR");
    expect(canonicalAnswer("Não sabe / Não responde")).toBe("NS/NR");
    expect(canonicalAnswer("PS")).toBeNull();
  });
});

describe("questionNumberFromSheetName", () => {
  it("aceita P1, Pergunta 1, 1, Q1 e variantes", () => {
    expect(questionNumberFromSheetName("P1")).toBe(1);
    expect(questionNumberFromSheetName("p 2")).toBe(2);
    expect(questionNumberFromSheetName("Pergunta 3")).toBe(3);
    expect(questionNumberFromSheetName("4")).toBe(4);
    expect(questionNumberFromSheetName("Q5")).toBe(5);
    expect(questionNumberFromSheetName("P6 - Avaliação")).toBe(6);
    expect(questionNumberFromSheetName("P08")).toBe(8);
  });
  it("ignora META e nomes sem número válido", () => {
    expect(questionNumberFromSheetName("META")).toBeNull();
    expect(questionNumberFromSheetName("Notas")).toBeNull();
    expect(questionNumberFromSheetName("P9")).toBeNull();
    expect(questionNumberFromSheetName("P10")).toBeNull();
  });
});

describe("parseExcelDate", () => {
  it("lê ISO, DD/MM/AAAA, serial Excel e Date", () => {
    expect(parseExcelDate("2026-09-07")).toBe("2026-09-07");
    expect(parseExcelDate("7/9/2026")).toBe("2026-09-07");
    expect(parseExcelDate(46272)).toBe("2026-09-07");
    expect(parseExcelDate(new Date(Date.UTC(2026, 8, 7)))).toBe("2026-09-07");
    expect(parseExcelDate("hoje")).toBeNull();
  });
});

describe("formatação PT-PT", () => {
  it("usa vírgula decimal e sinal menos tipográfico", () => {
    expect(formatNumberPt(27.9, 1)).toBe("27,9");
    expect(formatNumberPt(-37.7, 1)).toBe("−37,7");
    expect(formatNumberPt(-23, 0)).toBe("−23");
    expect(formatSignedPt(1.2, 1)).toBe("+1,2");
    expect(formatSignedPt(-0.4, 1)).toBe("−0,4");
  });
  it("datas como «7 Set 2026»", () => {
    expect(formatDatePt("2026-09-07")).toEqual({ long: "7 Set 2026", short: "7 Set" });
    expect(formatDatePt("2026-08-31").long).toBe("31 Ago 2026");
  });
  it("decimais por tipo e variação nula", () => {
    expect(decimalsForKind("PARTY")).toBe(1);
    expect(decimalsForKind("APPROVAL")).toBe(0);
    expect(isFlatDelta(0.04, 1)).toBe(true);
    expect(isFlatDelta(0.1, 1)).toBe(false);
    expect(isFlatDelta(0.4, 0)).toBe(true);
  });
  it("iniciais para o avatar", () => {
    expect(initialsOf("Maria da Graça Carvalho")).toBe("MC");
    expect(initialsOf("Luís Neves")).toBe("LN");
    expect(initialsOf("PS")).toBe("P");
  });
});
