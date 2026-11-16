/**
 * Leitura do Dataset a partir do Supabase. Funciona com o cliente do browser ou do servidor:
 * o RLS decide o que cada pessoa vê (o trabalhador só recebe a sua ficha, turnos e pedidos).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Anexo,
  Ausencia,
  Dataset,
  Feriado,
  Grupo,
  Necessidade,
  NecessidadeDia,
  Periodo,
  Pessoa,
  Regras,
  Slot,
  Turno,
} from "./tipos";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));

export function mapRegras(r: Row | null): Regras {
  return {
    descansoMinimoHoras: n(r?.descanso_minimo_horas ?? 12),
    maxDiasConsecutivos: n(r?.max_dias_consecutivos ?? 7),
    folgasMinimas: n(r?.folgas_minimas ?? 4),
    janelaFolgas: n(r?.janela_folgas ?? 14),
    maxHorasSemanais: n(r?.max_horas_semanais ?? 40),
    minimoPeriodoSoSemana: r?.minimo_periodo_so_semana !== false,
    fdsFolgasNormal: n(r?.fds_folgas_normal ?? 2),
    fdsFolgasSequencia: n(r?.fds_folgas_sequencia ?? 3),
    fdsSequenciaMin: n(r?.fds_sequencia_min ?? 3),
    piqueteDiasSeguidos: n(r?.piquete_dias_seguidos ?? 7),
    piqueteFolgas: n(r?.piquete_folgas ?? 3),
    feriasDiasAno: n(r?.ferias_dias_ano ?? 22),
    feriadoComoFds: r?.feriado_como_fds === true,
  };
}

export const mapSlot = (r: Row): Slot => ({
  id: s(r.id),
  etiqueta: s(r.etiqueta),
  inicioMin: n(r.inicio_min),
  fimMin: n(r.fim_min),
  periodo: s(r.periodo) as Periodo,
  piquete: !!r.piquete,
  nota: s(r.nota),
  ordem: n(r.ordem),
  ativo: r.ativo !== false,
  horas: n(r.horas),
});

export const mapTurno = (r: Row): Turno => {
  const regras = (Array.isArray(r.excecao_regras) ? r.excecao_regras : []) as Turno["excecaoRegras"];
  return {
    id: s(r.id),
    data: s(r.data),
    slotId: s(r.slot_id),
    pessoaId: s(r.pessoa_id),
    grupoId: s(r.grupo_id),
    origem: (s(r.origem) || "MANUAL") as Turno["origem"],
    excecaoRegras: regras,
    excecao: regras.length > 0,
    justificacao: s(r.justificacao),
    criadoPor: (r.criado_por as string) ?? null,
    createdAt: s(r.created_at),
  };
};

export const mapAusencia = (r: Row): Ausencia => ({
  id: s(r.id),
  pessoaId: s(r.pessoa_id),
  tipo: s(r.tipo) as Ausencia["tipo"],
  inicio: s(r.inicio),
  fim: s(r.fim),
  estado: s(r.estado) as Ausencia["estado"],
  justificacao: s(r.justificacao),
  notaDecisao: s(r.nota_decisao),
  excecao: s(r.excecao),
  decididoPor: (r.decidido_por as string) ?? null,
  decididoEm: (r.decidido_em as string) ?? null,
  criadoPor: (r.criado_por as string) ?? null,
  createdAt: s(r.created_at),
  anexos: ((r.escala_ausencia_anexos as Row[]) ?? []).map(
    (a): Anexo => ({ id: s(a.id), caminho: s(a.caminho), nome: s(a.nome), tamanho: n(a.tamanho), tipo: s(a.tipo) })
  ),
});

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

/** Lê todas as páginas de uma consulta (o PostgREST limita cada resposta a ~1000 linhas). */
async function todas(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  what: string,
  page = 1000
): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await build(i * page, i * page + page - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/**
 * Carrega configuração completa, pessoas visíveis, turnos no intervalo e ausências que o tocam.
 * Para regras e compensações, peça um intervalo com margem (ex.: 9 semanas antes, 3 depois).
 */
export async function carregarDataset(
  sb: SupabaseClient,
  from: string,
  to: string,
  opts: { todasAusencias?: boolean } = {}
): Promise<Dataset> {
  const [regras, periodos, grupos, minimos, slots, nec, necDia, fer, pessoas, pp, alt, saldo, turnos, aus] = await Promise.all([
    sb.from("escala_regras").select("*").eq("id", 1).maybeSingle(),
    sb.from("escala_periodos").select("*").order("ordem"),
    sb.from("escala_grupos").select("*").order("ordem"),
    sb.from("escala_grupo_minimos").select("*"),
    sb.from("escala_slots").select("*").order("inicio_min"),
    sb.from("escala_necessidades").select("*"),
    sb.from("escala_necessidades_dia").select("*").gte("data", from).lte("data", to),
    sb.from("escala_feriados").select("*").order("data"),
    sb.from("escala_pessoas").select("*").order("nome"),
    sb.from("escala_pessoa_periodos").select("*"),
    sb.from("escala_alternancias").select("*"),
    sb.from("escala_ferias_saldo").select("*"),
    todas(
      (a, b) => sb.from("escala_turnos").select("*").gte("data", from).lte("data", to).order("data").order("id").range(a, b),
      "turnos"
    ),
    todas((a, b) => {
      let q = sb.from("escala_ausencias").select("*, escala_ausencia_anexos(id, caminho, nome, tamanho, tipo)");
      if (!opts.todasAusencias) q = q.lte("inicio", to).gte("fim", from);
      return q.order("inicio").order("id").range(a, b);
    }, "ausências"),
  ]);

  const perRows = check<Row[]>(periodos, "períodos");
  const per: Record<Periodo, string> = { M: "Manhã", T: "Tarde", N: "Noite" };
  for (const r of perRows) per[s(r.codigo) as Periodo] = s(r.nome);

  const minRows = check<Row[]>(minimos, "mínimos");
  const gruposOut: Grupo[] = check<Row[]>(grupos, "grupos").map((g) => {
    const m: Partial<Record<Periodo, number>> = {};
    for (const x of minRows) if (x.grupo_id === g.id) m[s(x.periodo) as Periodo] = n(x.minimo);
    return { id: s(g.id), nome: s(g.nome), ordem: n(g.ordem), estimado: !!g.estimado, ativo: g.ativo !== false, minimos: m };
  });

  const ppRows = check<Row[]>(pp, "perfis");
  const altRows = check<Row[]>(alt, "alternâncias");
  const saldoRows = check<Row[]>(saldo, "férias");
  const pessoasOut: Pessoa[] = check<Row[]>(pessoas, "pessoas").map((p) => {
    const id = s(p.id);
    const a = altRows.find((x) => x.pessoa_a === id || x.pessoa_b === id);
    const fs: Record<string, number> = {};
    for (const x of saldoRows) if (x.pessoa_id === id) fs[s(x.ano)] = n(x.dias);
    const ordem: Periodo[] = ["M", "T", "N"];
    return {
      id,
      codigo: s(p.codigo),
      nome: s(p.nome),
      email: (p.email as string) ?? null,
      userId: (p.user_id as string) ?? null,
      grupoId: s(p.grupo_id),
      papel: s(p.papel) as Pessoa["papel"],
      periodos: ordem.filter((k) => ppRows.some((x) => x.pessoa_id === id && x.periodo === k)),
      fazFds: !!p.faz_fds,
      todosFds: !!p.todos_fds,
      soFds: !!p.so_fds,
      integraGrupoId: (p.integra_grupo_id as string) ?? null,
      ciclo7: !!p.ciclo7,
      ativo: p.ativo !== false,
      notas: s(p.notas),
      alternaCom: a ? s(a.pessoa_a === id ? a.pessoa_b : a.pessoa_a) : null,
      feriasSaldo: fs,
    };
  });

  return {
    regras: mapRegras(check<Row | null>(regras, "regras")),
    periodos: per,
    grupos: gruposOut,
    slots: check<Row[]>(slots, "slots").map(mapSlot),
    necessidades: check<Row[]>(nec, "necessidades").map(
      (r): Necessidade => ({
        grupoId: s(r.grupo_id),
        slotId: s(r.slot_id),
        tipoDia: s(r.tipo_dia) as Necessidade["tipoDia"],
        minimo: n(r.minimo),
        maximo: n(r.maximo),
      })
    ),
    necessidadesDia: check<Row[]>(necDia, "necessidades por dia").map(
      (r): NecessidadeDia => ({ data: s(r.data), grupoId: s(r.grupo_id), slotId: s(r.slot_id), minimo: n(r.minimo), maximo: n(r.maximo) })
    ),
    feriados: check<Row[]>(fer, "feriados").map((r): Feriado => ({ data: s(r.data), nome: s(r.nome), ambito: s(r.ambito) })),
    pessoas: pessoasOut,
    turnos: turnos.map(mapTurno),
    ausencias: aus.map(mapAusencia),
  };
}

/** Traduz erros da base de dados (triggers ESCALA_HARD / ESCALA:...) para texto legível. */
export function mensagemErro(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const m = raw.match(/ESCALA(?:_HARD)?:[A-Z_]+:\s*(.*)$/);
  if (m) return m[1];
  if (/escala_ausencias_sem_sobreposicao/.test(raw)) return "Já existe uma ausência aprovada que se sobrepõe a estas datas.";
  if (/duplicate key.*escala_pessoas_email_idx/.test(raw)) return "Este email já está registado noutra pessoa.";
  if (/duplicate key.*codigo/.test(raw)) return "Já existe uma pessoa com este identificador.";
  if (/violates foreign key constraint.*escala_(turnos|ausencias)/.test(raw))
    return "Esta pessoa tem turnos ou ausências registados: desative-a em vez de a eliminar, para manter o histórico.";
  if (/ESCALA:SEM_PERMISSAO|42501|row-level security/.test(raw)) return "Sem permissão para esta operação.";
  return raw;
}
