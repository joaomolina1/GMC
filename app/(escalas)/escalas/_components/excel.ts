"use client";

/**
 * Excel das Escalas — mesmo formato de folhas do protótipo (escalas_base.xlsx):
 * Pessoas, Grupos, Slots, Necessidades, Necessidades por dia, Ausências, Turnos, Feriados, Definições.
 * As folhas "Escala …" e "Horas" são só de leitura.
 */
import { DIAS, dow, dRange, fmtDMY, hmToMin, minToHM, pad, todayISO } from "@lib/escalas/datas";
import type { Motor } from "@lib/escalas/motor";
import { PERIODOS, type EstadoAusencia, type Periodo, type Regras, type TipoAusencia } from "@lib/escalas/tipos";

type XLSXMod = typeof import("xlsx");
const carregarXLSX = () => import("xlsx") as Promise<XLSXMod>;

const SN = (v: boolean) => (v ? "S" : "N");
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const bool = (v: unknown) =>
  typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : ["s", "sim", "true", "1", "x", "y", "yes", "v", "verdadeiro"].includes(norm(v));
const slug = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const DEFINICOES: [keyof Regras, string, string][] = [
  ["descansoMinimoHoras", "Descanso mínimo entre turnos", "horas"],
  ["maxDiasConsecutivos", "Máximo de dias seguidos de trabalho", "dias"],
  ["folgasMinimas", "Folgas mínimas por janela", "dias"],
  ["janelaFolgas", "Tamanho da janela deslizante de folgas", "dias"],
  ["maxHorasSemanais", "Máximo de horas por semana", "horas"],
  ["minimoPeriodoSoSemana", "Mínimo por período só nos dias úteis", "1 = sim, 0 = também ao fds e feriados"],
  ["fdsFolgasNormal", "Folgas devidas por cada fim de semana trabalhado", "dias (0 desliga)"],
  ["fdsFolgasSequencia", "Folgas por fim de semana quando em sequência", "dias"],
  ["fdsSequenciaMin", "Fins de semana seguidos para ativar a sequência", "fins de semana"],
  ["piqueteDiasSeguidos", "Dias seguidos de piquete que geram compensação", "dias"],
  ["piqueteFolgas", "Folgas por cada bloco de piquete", "dias"],
  ["feriasDiasAno", "Dias úteis de férias por ano (valor por omissão)", "dias"],
  ["feriadoComoFds", "Feriados usam as necessidades de fim de semana", "1 = sim, 0 = não"],
];

// ---------------------------------------------------------------- exportar
export async function exportarExcel(motor: Motor, from: string, to: string) {
  const XLSX = await carregarXLSX();
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[], cols: string[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(cols.map((c) => [c, ""]))], { header: cols });
    ws["!cols"] = cols.map((c) => ({ wch: Math.max(10, Math.min(44, Math.max(c.length + 3, ...rows.slice(0, 200).map((r) => String(r[c] ?? "").length + 2)))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31));
  };
  const ds = motor.ds;
  const nomeP = (id: string) => ds.pessoas.find((p) => p.id === id);

  add(
    "Leia-me",
    [
      { Tópico: "O que é", Conteúdo: "Exportação da app de Escalas. Pode ser editada e reimportada (Excel → Importar)." },
      { Tópico: "Exportado em", Conteúdo: new Date().toLocaleString("pt-PT") },
      { Tópico: "Intervalo", Conteúdo: `${fmtDMY(from)} a ${fmtDMY(to)} (folhas Escala, Horas, Turnos e Necessidades por dia)` },
      { Tópico: "Folhas “Escala …” e “Horas”", Conteúdo: "Leitura humana. Não são lidas na importação." },
      { Tópico: "Datas", Conteúdo: "Use AAAA-MM-DD ou DD/MM/AAAA. Horas em HH:MM. Sim/Não como S/N." },
      { Tópico: "Identificadores", Conteúdo: "A coluna ID das Pessoas liga-as a turnos e ausências. Não a altere para pessoas existentes." },
    ],
    ["Tópico", "Conteúdo"]
  );
  for (const g of motor.grupos) {
    const rows = dRange(from, to).map((d) => {
      const r: Record<string, unknown> = { Data: fmtDMY(d), Dia: DIAS[dow(d)] };
      for (const s of motor.slots)
        r[s.etiqueta] = motor
          .atribuidos(d, s.id, g.id)
          .map((p) => p.nome + (motor.entradaDe(p.id, d)?.excecao ? " (exceção)" : ""))
          .join(", ");
      return r;
    });
    add("Escala " + g.nome, rows, ["Data", "Dia", ...motor.slots.map((s) => s.etiqueta)]);
  }
  add(
    "Horas",
    motor.pessoas.map((p) => {
      const s = motor.estatPessoa(p.id, from, to);
      return { Pessoa: p.nome, Grupo: motor.nomeGrupo(p.grupoId), Turnos: s.t, Horas: s.h, Manhã: s.M, Tarde: s.T, Noite: s.N, Piquetes: s.piq, "Fins de semana": s.fds, "Dias ausente": s.abs, Exceções: s.exc };
    }),
    ["Pessoa", "Grupo", "Turnos", "Horas", "Manhã", "Tarde", "Noite", "Piquetes", "Fins de semana", "Dias ausente", "Exceções"]
  );
  const ano = todayISO().slice(0, 4);
  add(
    "Pessoas",
    [...ds.pessoas]
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
      .map((p) => ({
        ID: p.codigo,
        Nome: p.nome,
        Grupo: p.grupoId,
        Manhã: SN(p.periodos.includes("M")),
        Tarde: SN(p.periodos.includes("T")),
        Noite: SN(p.periodos.includes("N")),
        FDS: SN(p.fazFds),
        "Todos FDS": SN(p.todosFds),
        "Só FDS": SN(p.soFds),
        "Alterna com (ID)": p.alternaCom ? nomeP(p.alternaCom)?.codigo ?? "" : "",
        "Integra grupo": p.integraGrupoId ?? "",
        "Ciclo 7 dias": SN(p.ciclo7),
        Papel: p.papel === "ADMINISTRADOR" ? "Administração" : p.papel === "COORDENADOR" ? "Coordenação" : "Trabalhador",
        Email: p.email ?? "",
        "Dias férias/ano": motor.feriasSaldo(p.id, ano),
        Ativo: SN(p.ativo),
        Notas: p.notas,
      })),
    ["ID", "Nome", "Grupo", "Manhã", "Tarde", "Noite", "FDS", "Todos FDS", "Só FDS", "Alterna com (ID)", "Integra grupo", "Ciclo 7 dias", "Papel", "Email", "Dias férias/ano", "Ativo", "Notas"]
  );
  add(
    "Grupos",
    ds.grupos.map((g) => ({ ID: g.id, Nome: g.nome, "Mín. manhã": g.minimos.M ?? 0, "Mín. tarde": g.minimos.T ?? 0, "Mín. noite": g.minimos.N ?? 0, Estimado: SN(g.estimado), Ativo: SN(g.ativo) })),
    ["ID", "Nome", "Mín. manhã", "Mín. tarde", "Mín. noite", "Estimado", "Ativo"]
  );
  add(
    "Slots",
    ds.slots.map((s) => ({ ID: s.id, Horário: s.etiqueta, Início: minToHM(s.inicioMin), Fim: minToHM(s.fimMin), Período: s.periodo, Piquete: SN(s.piquete), Nota: s.nota, Ativo: SN(s.ativo) })),
    ["ID", "Horário", "Início", "Fim", "Período", "Piquete", "Nota", "Ativo"]
  );
  add(
    "Necessidades",
    ds.necessidades.map((n) => ({ Grupo: n.grupoId, "Tipo de dia": n.tipoDia === "FDS" ? "fds" : "semana", Slot: n.slotId, Mín: n.minimo, Máx: n.maximo })),
    ["Grupo", "Tipo de dia", "Slot", "Mín", "Máx"]
  );
  add(
    "Necessidades por dia",
    ds.necessidadesDia.filter((n) => n.data >= from && n.data <= to).map((n) => ({ Data: n.data, Grupo: n.grupoId, Slot: n.slotId, Mín: n.minimo, Máx: n.maximo })),
    ["Data", "Grupo", "Slot", "Mín", "Máx"]
  );
  add(
    "Ausências",
    [...ds.ausencias]
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((a) => ({
        ID: a.id,
        "Pessoa (ID)": nomeP(a.pessoaId)?.codigo ?? "",
        Nome: nomeP(a.pessoaId)?.nome ?? "",
        Tipo: a.tipo,
        De: a.inicio,
        Até: a.fim,
        Justificação: a.justificacao,
        Estado: a.estado,
        Nota: a.notaDecisao,
        Exceção: a.excecao,
        Anexo: a.anexos.map((x) => x.nome).join(", "),
      })),
    ["ID", "Pessoa (ID)", "Nome", "Tipo", "De", "Até", "Justificação", "Estado", "Nota", "Exceção", "Anexo"]
  );
  add(
    "Turnos",
    [...ds.turnos]
      .filter((t) => t.data >= from && t.data <= to)
      .sort((a, b) => a.data.localeCompare(b.data) || (motor.slot(a.slotId)?.inicioMin ?? 0) - (motor.slot(b.slotId)?.inicioMin ?? 0))
      .map((t) => ({
        Data: t.data,
        Dia: DIAS[dow(t.data)],
        Grupo: t.grupoId,
        Slot: t.slotId,
        Horário: motor.slot(t.slotId)?.etiqueta ?? "",
        "Pessoa (ID)": nomeP(t.pessoaId)?.codigo ?? "",
        Nome: nomeP(t.pessoaId)?.nome ?? "",
        Origem: t.origem,
        Exceção: SN(t.excecao),
        Regras: t.excecaoRegras.join(", "),
        Justificação: t.justificacao,
      })),
    ["Data", "Dia", "Grupo", "Slot", "Horário", "Pessoa (ID)", "Nome", "Origem", "Exceção", "Regras", "Justificação"]
  );
  add(
    "Feriados",
    ds.feriados.map((f) => ({ Data: f.data, Nome: f.nome, Âmbito: f.ambito })),
    ["Data", "Nome", "Âmbito"]
  );
  add(
    "Definições",
    DEFINICOES.map(([k, t, u]) => ({ Chave: k, Valor: typeof motor.regras[k] === "boolean" ? (motor.regras[k] ? 1 : 0) : motor.regras[k], Descrição: `${t} (${u})` })),
    ["Chave", "Valor", "Descrição"]
  );

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `escalas_${todayISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}

// ---------------------------------------------------------------- importar
export interface Importacao {
  config: null | {
    regras?: Regras;
    grupos?: { id: string; nome: string; ordem: number; estimado: boolean; ativo: boolean; minimos: Partial<Record<Periodo, number>> }[];
    slots?: { id: string; etiqueta: string; inicioMin: number; fimMin: number; periodo: Periodo; piquete: boolean; nota: string; ordem: number; ativo: boolean }[];
    necessidades?: { grupoId: string; slotId: string; tipoDia: "SEMANA" | "FDS"; minimo: number; maximo: number }[];
  };
  pessoas:
    | null
    | {
        codigo: string;
        nome: string;
        grupoId: string;
        periodos: Periodo[];
        fazFds: boolean;
        todosFds: boolean;
        soFds: boolean;
        alternaCodigo: string;
        integra: string;
        ciclo7: boolean;
        papel: "TRABALHADOR" | "COORDENADOR" | "ADMINISTRADOR";
        email: string;
        ferias: number | null;
        ativo: boolean;
        notas: string;
      }[];
  ausencias: null | { id: string | null; codigo: string; tipo: TipoAusencia; inicio: string; fim: string; justificacao: string; estado: EstadoAusencia; nota: string; excecao: string }[];
  turnos: null | { data: string; slotId: string; codigo: string; justificacao: string }[];
  necessidadesDia: null | { data: string; grupoId: string; slotId: string; minimo: number; maximo: number }[];
  feriados: null | { data: string; nome: string; ambito: string }[];
  avisos: string[];
}

function parseData(v: unknown, XLSX: XLSXMod): string | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") {
    const o = XLSX.SSF.parse_date_code(v);
    return o ? `${o.y}-${pad(o.m)}-${pad(o.d)}` : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}
const parsePer = (v: unknown): Periodo => {
  const s = norm(v);
  return s.startsWith("t") || s === "a" ? "T" : s.startsWith("n") ? "N" : "M";
};
const parseTipo = (v: unknown): TipoAusencia => {
  const s = norm(v);
  return s.startsWith("fe") ? "FERIAS" : s.startsWith("ba") ? "BAIXA" : s.startsWith("fo") || s.startsWith("comp") ? "FOLGA" : "INDISPONIBILIDADE";
};
const parseEstado = (v: unknown): EstadoAusencia => {
  const s = norm(v);
  return s.startsWith("pe") ? "PENDENTE" : s.startsWith("re") ? "REJEITADA" : s.startsWith("ca") ? "CANCELADA" : "APROVADA";
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function lerExcel(file: File, motor: Motor): Promise<Importacao> {
  const XLSX = await carregarXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const folha = (...nomes: string[]) => {
    const n = wb.SheetNames.find((x) => nomes.some((y) => norm(x) === norm(y)));
    if (!n) return null;
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n], { defval: "", raw: true }).map((r) => {
      const o: Record<string, unknown> = {};
      for (const k in r) o[norm(k)] = r[k];
      return o;
    });
  };
  const out: Importacao = { config: null, pessoas: null, ausencias: null, turnos: null, necessidadesDia: null, feriados: null, avisos: [] };
  const cfg: NonNullable<Importacao["config"]> = {};

  const gr = folha("Grupos");
  if (gr?.some((r) => r.id)) {
    cfg.grupos = gr
      .filter((r) => String(r.id).trim())
      .map((r, i) => ({
        id: String(r.id).trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 12),
        nome: String(r.nome || r.id).trim(),
        ordem: i + 1,
        estimado: bool(r.estimado),
        ativo: r.ativo === "" || r.ativo === undefined ? true : bool(r.ativo),
        minimos: { M: +(r.minmanha as number) || 0, T: +(r.mintarde as number) || 0, N: +(r.minnoite as number) || 0 },
      }));
  }
  const gids = new Set((cfg.grupos ?? motor.ds.grupos).map((g) => g.id));

  const sl = folha("Slots");
  if (sl?.some((r) => r.id)) {
    const slots = sl
      .filter((r) => String(r.id).trim())
      .map((r, i) => {
        const a = hmToMin(r.inicio);
        const b0 = hmToMin(r.fim);
        return {
          id: String(r.id).trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 12),
          etiqueta: String(r.horario || `${minToHM(a)}–${minToHM(b0)}`).trim(),
          inicioMin: a,
          fimMin: b0 <= a ? b0 + 1440 : b0,
          periodo: parsePer(r.periodo),
          piquete: bool(r.piquete),
          nota: String(r.nota ?? ""),
          ordem: i + 1,
          ativo: r.ativo === "" || r.ativo === undefined ? true : bool(r.ativo),
        };
      });
    const bad = slots.filter((s) => Number.isNaN(s.inicioMin) || Number.isNaN(s.fimMin));
    if (bad.length) out.avisos.push(`${bad.length} slot(s) com horas inválidas ignorados.`);
    cfg.slots = slots.filter((s) => !Number.isNaN(s.inicioMin) && !Number.isNaN(s.fimMin));
  }
  const allSlots = cfg.slots ?? motor.ds.slots;
  const slotDe = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    return allSlots.find((x) => x.id === s.toUpperCase())?.id ?? allSlots.find((x) => norm(x.etiqueta) === norm(s))?.id ?? null;
  };

  const nd = folha("Necessidades");
  if (nd?.length) {
    cfg.necessidades = [];
    for (const r of nd) {
      const g = String(r.grupo ?? "").trim();
      const s = slotDe(r.slot);
      if (!g || !s) continue;
      const mn = +(r.min as number) || 0;
      const mx = Math.max(mn, +(r.max as number) || 0);
      if (mn || mx) cfg.necessidades.push({ grupoId: g, slotId: s, tipoDia: norm(r.tipodedia).startsWith("f") ? "FDS" : "SEMANA", minimo: mn, maximo: mx });
    }
  }
  const df = folha("Definições", "Definicoes");
  if (df?.length) {
    const regras = { ...motor.regras } as Regras;
    for (const r of df) {
      const k = String(r.chave ?? "").trim() as keyof Regras;
      if (!(k in regras) || r.valor === "" || Number.isNaN(+(r.valor as number))) continue;
      (regras as unknown as Record<string, unknown>)[k] = typeof regras[k] === "boolean" ? +(r.valor as number) !== 0 : +(r.valor as number);
    }
    cfg.regras = regras;
  }
  if (Object.keys(cfg).length) out.config = cfg;

  const pe = folha("Pessoas");
  if (pe) {
    out.pessoas = [];
    for (const r of pe) {
      const nome = String(r.nome ?? "").trim();
      if (!nome) continue;
      const grupo = String(r.grupo ?? "").trim();
      if (!gids.has(grupo)) {
        out.avisos.push(`${nome}: grupo “${grupo}” não existe (ignorada).`);
        continue;
      }
      const periodos = PERIODOS.filter((k) => bool(r[k === "M" ? "manha" : k === "T" ? "tarde" : "noite"]));
      const papelN = norm(r.papel);
      out.pessoas.push({
        codigo: slug(r.id || nome),
        nome,
        grupoId: grupo,
        periodos,
        fazFds: bool(r.fds) || bool(r.todosfds) || bool(r.sofds),
        todosFds: bool(r.todosfds),
        soFds: bool(r.sofds),
        alternaCodigo: r.alternacomid ? slug(r.alternacomid) : "",
        integra: String(r.integragrupo ?? "").trim(),
        ciclo7: bool(r.ciclo7dias),
        papel: papelN.startsWith("admin") ? "ADMINISTRADOR" : papelN.startsWith("coord") ? "COORDENADOR" : "TRABALHADOR",
        email: String(r.email ?? "").trim().toLowerCase(),
        ferias: r.diasferiasano === "" || r.diasferiasano === undefined ? null : +(r.diasferiasano as number) || 0,
        ativo: r.ativo === "" || r.ativo === undefined ? true : bool(r.ativo),
        notas: String(r.notas ?? ""),
      });
    }
  }
  const codigos = new Set([...(out.pessoas ?? []).map((p) => p.codigo), ...motor.ds.pessoas.map((p) => p.codigo)]);

  const ab = folha("Ausências", "Ausencias");
  if (ab) {
    out.ausencias = [];
    let bad = 0;
    for (const r of ab) {
      const codigo = slug(r.pessoaid || r.nome);
      const de = parseData(r.de, XLSX);
      const a = parseData(r.ate, XLSX) || de;
      if (!codigo || !de || !a || !codigos.has(codigo)) {
        if (r.pessoaid || r.nome || r.de) bad++;
        continue;
      }
      const id = String(r.id ?? "").trim();
      out.ausencias.push({
        id: UUID_RE.test(id) ? id : null,
        codigo,
        tipo: parseTipo(r.tipo),
        inicio: de,
        fim: a < de ? de : a,
        justificacao: String(r.justificacao ?? ""),
        estado: parseEstado(r.estado),
        nota: String(r.nota ?? ""),
        excecao: String(r.excecao ?? ""),
      });
    }
    if (bad) out.avisos.push(`${bad} ausência(s) ignorada(s): pessoa desconhecida ou data inválida.`);
  }

  const tu = folha("Turnos");
  if (tu) {
    out.turnos = [];
    let bad = 0;
    for (const r of tu) {
      const d = parseData(r.data, XLSX);
      const s = slotDe(r.slot || r.horario);
      const codigo = slug(r.pessoaid || r.nome);
      if (!d || !s || !codigo || !codigos.has(codigo)) {
        if (r.data || r.slot || r.pessoaid) bad++;
        continue;
      }
      out.turnos.push({ data: d, slotId: s, codigo, justificacao: String(r.justificacao ?? "") });
    }
    if (bad) out.avisos.push(`${bad} turno(s) ignorado(s): data, slot ou pessoa inválidos.`);
  }

  const no = folha("Necessidades por dia", "Necessidades dia");
  if (no) {
    out.necessidadesDia = [];
    for (const r of no) {
      const d = parseData(r.data, XLSX);
      const g = String(r.grupo ?? "").trim();
      const s = slotDe(r.slot);
      if (!d || !g || !s) continue;
      const mn = +(r.min as number) || 0;
      out.necessidadesDia.push({ data: d, grupoId: g, slotId: s, minimo: mn, maximo: Math.max(mn, +(r.max as number) || 0) });
    }
  }
  const fe = folha("Feriados");
  if (fe) {
    out.feriados = [];
    for (const r of fe) {
      const d = parseData(r.data, XLSX);
      if (!d || !String(r.nome ?? "").trim()) continue;
      const amb = norm(r.ambito);
      out.feriados.push({ data: d, nome: String(r.nome).trim(), ambito: amb.startsWith("loc") ? "LOCAL" : amb.startsWith("emp") ? "EMPRESA" : "NACIONAL" });
    }
  }
  return out;
}
