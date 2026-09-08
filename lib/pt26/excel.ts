import * as XLSX from "xlsx";
import type { Matcher } from "./matching";
import { normalizeText, parseExcelDate, parseNumber, questionNumberFromSheetName } from "./normalize";
import {
  ANSWER_KEYS,
  PERCENTAGE_KINDS,
  REQUIRED_ANSWERS,
  type ImportIssue,
  type ParsedItem,
  type ParsedQuadro,
  type ParsedQuestion,
  type ParsedWorkbook,
  type QuestionRow,
  type ReplaceWeekPayload,
} from "./types";

/* ------------------------------------------------------------------ cabeçalhos */

type Column = "quadro" | "pessoa" | "item" | "valor" | "titulo";

const HEADER_ALIASES: Record<string, Column> = {
  quadro: "quadro",
  q: "quadro",
  pessoa: "pessoa",
  cara: "pessoa",
  item: "item",
  valor: "valor",
  titulo: "titulo",
};

function detectColumns(header: unknown[]): Partial<Record<Column, number>> {
  const cols: Partial<Record<Column, number>> = {};
  header.forEach((cell, i) => {
    const key = normalizeText(cell);
    const col = HEADER_ALIASES[key];
    if (col && cols[col] === undefined) cols[col] = i;
  });
  return cols;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => cellText(c) === "");
}

/* ------------------------------------------------------------------ parser */

export interface ParseContext {
  questions: QuestionRow[];
  matcher: Matcher;
}

/**
 * Lê um livro Excel (uma semana) e devolve os quadros/itens por pergunta com os matches
 * de pessoa/partido e a lista de erros (bloqueantes) e avisos.
 */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, ctx: ParseContext): ParsedWorkbook {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const issues: ImportIssue[] = [];

  // Sheets → número de pergunta
  const sheetByQuestion = new Map<number, string>();
  let metaDate: string | null = null;
  for (const name of wb.SheetNames) {
    if (normalizeText(name) === "meta") {
      metaDate = readMetaDate(wb.Sheets[name]);
      continue;
    }
    const n = questionNumberFromSheetName(name);
    if (n === null) {
      issues.push({ level: "warning", code: "sheet_ignored", sheet: name, message: `Sheet «${name}» ignorada (não corresponde a P1…P8).` });
      continue;
    }
    if (sheetByQuestion.has(n)) {
      issues.push({ level: "error", code: "sheet_duplicate", sheet: name, message: `Sheet «${name}» repete a pergunta ${n} (já lida em «${sheetByQuestion.get(n)}»).` });
      continue;
    }
    sheetByQuestion.set(n, name);
  }

  const questions: ParsedQuestion[] = [];
  const sortedQuestions = [...ctx.questions].sort((a, b) => a.number - b.number);
  for (const q of sortedQuestions) {
    const sheetName = sheetByQuestion.get(q.number);
    if (!sheetName) {
      issues.push({ level: "error", code: "sheet_missing", message: `Falta a sheet da pergunta ${q.number} (P${q.number}).` });
      questions.push({ number: q.number, kind: q.kind, sheet: null, quadros: [] });
      continue;
    }
    const quadros = parseSheet(wb.Sheets[sheetName], sheetName, q, ctx, issues);
    questions.push({ number: q.number, kind: q.kind, sheet: sheetName, quadros });
  }

  return { questions, issues, metaDate };
}

function readMetaDate(sheet: XLSX.WorkSheet): string | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
  for (const row of rows) {
    const label = normalizeText(row[0]);
    if (label === "data" || label === "date" || label === "semana") {
      const d = parseExcelDate(row[1]);
      if (d) return d;
    }
  }
  return null;
}

function parseSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  q: QuestionRow,
  ctx: ParseContext,
  issues: ImportIssue[]
): ParsedQuadro[] {
  if (!sheet["!ref"]) {
    issues.push({ level: "error", code: "sheet_empty", sheet: sheetName, message: `Sheet «${sheetName}» está vazia.` });
    return [];
  }
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const readRow = (r: number): unknown[] => {
    const cells: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      cells[c - range.s.c] = cell ? cell.v : null;
    }
    return cells;
  };

  // Cabeçalho na linha 1 (primeira linha do intervalo usado)
  const cols = detectColumns(readRow(range.s.r));
  if (cols.item === undefined || cols.valor === undefined) {
    issues.push({
      level: "error",
      code: "header_missing",
      sheet: sheetName,
      row: range.s.r + 1,
      message: `Sheet «${sheetName}»: cabeçalho tem de incluir as colunas «Item» e «Valor» na linha 1.`,
    });
    return [];
  }

  const quadros = new Map<number, ParsedQuadro>();
  const order: number[] = [];
  let currentIdx = 1;

  const rawRows: { rowNumber: number; cells: unknown[] }[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cells = readRow(r);
    if (!isBlankRow(cells)) rawRows.push({ rowNumber: r + 1, cells });
  }

  for (const { rowNumber, cells } of rawRows) {
    const rawQuadro = cols.quadro !== undefined ? cellText(cells[cols.quadro]) : "";
    if (rawQuadro) {
      const n = parseNumber(rawQuadro);
      if (n === null || !Number.isInteger(n) || n < 1) {
        issues.push({ level: "error", code: "quadro_invalid", sheet: sheetName, row: rowNumber, message: `«Quadro» inválido: «${rawQuadro}» (inteiro ≥ 1).` });
        continue;
      }
      currentIdx = n;
    }
    const idx = currentIdx;
    let quadro = quadros.get(idx);
    if (!quadro) {
      quadro = { idx, title: null, personName: null, personId: null, items: [] };
      quadros.set(idx, quadro);
      order.push(idx);
    }

    const title = cols.titulo !== undefined ? cellText(cells[cols.titulo]) : "";
    if (title && !quadro.title) quadro.title = title;

    const personName = cols.pessoa !== undefined ? cellText(cells[cols.pessoa]) : "";
    if (personName && !quadro.personName) {
      quadro.personName = personName;
      const person = ctx.matcher.matchPerson(personName);
      if (person) {
        quadro.personId = person.id;
        quadro.personName = person.name;
      } else {
        issues.push({
          level: "warning",
          code: "person_unmatched",
          sheet: sheetName,
          row: rowNumber,
          message: `Pessoa «${personName}» sem correspondência — o quadro fica sem foto.`,
        });
      }
    }

    const rawItem = cellText(cells[cols.item]);
    const rawValue = cells[cols.valor];
    const hasValue = cellText(rawValue) !== "";
    if (!rawItem) {
      if (hasValue) {
        issues.push({ level: "error", code: "item_empty", sheet: sheetName, row: rowNumber, message: `Linha ${rowNumber}: «Item» vazio.` });
      }
      // linha só com Titulo/Pessoa/Quadro: aceita como metadados do quadro
      continue;
    }
    const value = parseNumber(rawValue);
    if (value === null) {
      issues.push({
        level: "error",
        code: "value_invalid",
        sheet: sheetName,
        row: rowNumber,
        message: `Linha ${rowNumber}: «Valor» não numérico para «${rawItem}» (${cellText(rawValue) || "vazio"}).`,
      });
      continue;
    }

    const match = ctx.matcher.matchItem(rawItem, q.kind);
    if (quadro.items.some((it) => normalizeText(it.key) === normalizeText(match.key))) {
      issues.push({ level: "error", code: "item_duplicate", sheet: sheetName, row: rowNumber, message: `Linha ${rowNumber}: item «${match.key}» repetido no quadro ${idx}.` });
      continue;
    }
    const item: ParsedItem = {
      raw: rawItem,
      key: match.key,
      value,
      partyId: match.partyId,
      personId: match.personId,
      matched: match.kind !== "none",
      row: rowNumber,
      sortOrder: quadro.items.length,
    };
    quadro.items.push(item);
    if (!item.matched) {
      issues.push({
        level: "warning",
        code: "item_unmatched",
        sheet: sheetName,
        row: rowNumber,
        message: `«${rawItem}» sem correspondência de pessoa/partido — aparece sem imagem.`,
      });
    }
  }

  const result = order.sort((a, b) => a - b).map((idx) => quadros.get(idx)!);

  if (result.length === 0) {
    issues.push({ level: "error", code: "sheet_no_items", sheet: sheetName, message: `Sheet «${sheetName}» não tem linhas de resultados.` });
    return result;
  }

  // Validações por quadro
  const required = REQUIRED_ANSWERS[q.kind];
  for (const quadro of result) {
    if (required) {
      const present = new Set(quadro.items.map((i) => i.key));
      const missing = required.filter((k) => !present.has(k));
      if (missing.length) {
        issues.push({
          level: "error",
          code: "answers_missing",
          sheet: sheetName,
          message: `Quadro ${quadro.idx}: faltam as respostas ${missing.join(", ")} (obrigatórias em ${q.kind}).`,
        });
      }
    }
    if (q.kind === "MINISTER" && !quadro.personName) {
      issues.push({
        level: "warning",
        code: "person_missing",
        sheet: sheetName,
        message: `Quadro ${quadro.idx}: sem «Pessoa» — o quadro não terá a cara do ministro.`,
      });
    }
    if (q.kind === "RANKING") {
      const wrongSign = quadro.items.filter((i) => (q.sign > 0 ? i.value < 0 : i.value > 0));
      if (wrongSign.length) {
        issues.push({
          level: "warning",
          code: "sign_unexpected",
          sheet: sheetName,
          message: `Quadro ${quadro.idx}: ${wrongSign.map((i) => `«${i.key}» (${i.value})`).join(", ")} com sinal inesperado para «${q.title}».`,
        });
      }
    }
  }

  // Soma de percentagens (todos os quadros da pergunta em conjunto para PARTY; por quadro nos restantes)
  if (PERCENTAGE_KINDS.includes(q.kind)) {
    const groups: { label: string; items: ParsedItem[] }[] =
      q.kind === "PARTY"
        ? [{ label: "todos os quadros", items: result.flatMap((r) => r.items) }]
        : result.map((r) => ({ label: `quadro ${r.idx}`, items: r.items }));
    for (const g of groups) {
      const sum = g.items.reduce((s, i) => s + i.value, 0);
      if (g.items.length && (sum < 95 || sum > 105)) {
        issues.push({
          level: "warning",
          code: "sum_out_of_range",
          sheet: sheetName,
          message: `Soma das percentagens (${g.label}) = ${sum.toFixed(1).replace(".", ",")} — esperado entre 95 e 105.`,
        });
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ payload para a RPC */

export function toReplaceWeekPayload(
  parsed: ParsedWorkbook,
  week: { date: string; label: string; sourceFileName: string }
): ReplaceWeekPayload {
  return {
    date: week.date,
    label: week.label,
    source_file_name: week.sourceFileName,
    quadros: parsed.questions.flatMap((q) =>
      q.quadros.map((quadro) => ({
        question_number: q.number,
        idx: quadro.idx,
        // pessoa sem correspondência: guarda o nome no título para ficar visível e reassociável
        title: quadro.title ?? (quadro.personName && !quadro.personId ? quadro.personName : null),
        person_id: quadro.personId,
        results: quadro.items.map((it) => ({
          item_key: it.key,
          value: it.value,
          person_id: it.personId,
          party_id: it.partyId,
          sort_order: it.sortOrder,
        })),
      }))
    ),
  };
}

/* ------------------------------------------------------------------ template */

export interface TemplateQuadro {
  idx: number;
  title: string | null;
  personName: string | null;
  items: string[];
}

export interface TemplateQuestion {
  number: number;
  title: string;
  kind: QuestionRow["kind"];
  quadros: TemplateQuadro[];
}

/** Estrutura por defeito quando ainda não há semanas importadas. */
export function defaultTemplateQuestions(questions: QuestionRow[], partyAcronyms: string[]): TemplateQuestion[] {
  const [a, b, c, ...rest] = partyAcronyms;
  const answersApproval = [ANSWER_KEYS.APROVA, ANSWER_KEYS.DESAPROVA, ANSWER_KEYS.NSNR];
  const answersYesNo = [ANSWER_KEYS.SIM, ANSWER_KEYS.NAO, ANSWER_KEYS.NSNR];
  return [...questions]
    .sort((x, y) => x.number - y.number)
    .map((q) => {
      let quadros: TemplateQuadro[];
      switch (q.kind) {
        case "PARTY":
          quadros = [
            { idx: 1, title: "Três primeiros", personName: null, items: [a, b, c].filter(Boolean) },
            { idx: 2, title: "Restantes partidos", personName: null, items: rest },
          ];
          break;
        case "APPROVAL":
          quadros = [{ idx: 1, title: null, personName: null, items: answersApproval }];
          break;
        case "YESNO":
          quadros = [{ idx: 1, title: null, personName: null, items: answersYesNo }];
          break;
        case "MINISTER":
          quadros = [
            { idx: 1, title: null, personName: "", items: answersYesNo },
            { idx: 2, title: null, personName: "", items: answersYesNo },
          ];
          break;
        default:
          quadros = [{ idx: 1, title: null, personName: null, items: ["", "", ""] }];
      }
      return { number: q.number, title: q.title, kind: q.kind, quadros };
    });
}

/** Gera o Excel modelo (8 sheets P1…P8 + META) com cabeçalhos e os itens indicados, sem valores. */
export function buildTemplateWorkbook(questions: TemplateQuestion[], weekDate?: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const q of questions) {
    const rows: (string | number | null)[][] = [["Quadro", "Pessoa", "Item", "Valor", "Titulo"]];
    for (const quadro of q.quadros) {
      const items = quadro.items.length ? quadro.items : [""];
      items.forEach((item, i) => {
        rows.push([quadro.idx, i === 0 ? (quadro.personName ?? "") : "", item, null, i === 0 ? (quadro.title ?? "") : ""]);
      });
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 8 }, { wch: 26 }, { wch: 28 }, { wch: 10 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, `P${q.number}`);
  }
  const meta = XLSX.utils.aoa_to_sheet([
    ["Data", weekDate ?? ""],
    ["Nota", "Uma sheet por pergunta (P1…P8). Colunas: Quadro (inteiro, default 1), Pessoa (cara do quadro, P6), Item, Valor, Titulo."],
    ["Perguntas", questions.map((q) => `P${q.number} — ${q.title}`).join(" · ")],
  ]);
  meta["!cols"] = [{ wch: 12 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, meta, "META");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Constrói um livro Excel a partir de valores (usado nos exemplos e nos testes). */
export function buildWorkbookFromValues(
  sheets: Record<string, (string | number | null)[][]>
): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
