import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayInLisbon } from "./dates";
import { conformidadeDe } from "./compliance";
import { settingsFromRow, settingsToRow } from "./settings";
import type {
  Atribuicao,
  Ausencia,
  EscalaSettings,
  EstadoEscala,
  Membro,
  PapelEscala,
  QuadroEscala,
  Slot,
  SoftCode,
  Turno,
} from "./types";

const SOFT: ReadonlySet<string> = new Set([
  "MAX_DIAS_CONSECUTIVOS",
  "FOLGAS_INSUFICIENTES",
  "DESCANSO_INSUFICIENTE",
  "HORAS_SEMANAIS",
]);

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function softCodes(value: unknown): SoftCode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((code): code is SoftCode => typeof code === "string" && SOFT.has(code));
}

function mapTurno(row: Row): Turno {
  return {
    code: str(row.codigo),
    nome: str(row.nome),
    inicio: str(row.inicio).slice(0, 5),
    fim: str(row.fim).slice(0, 5),
    atravessaMeiaNoite: Boolean(row.atravessa_meia_noite),
    ordem: Number(row.ordem) || 0,
  };
}

function mapMembro(row: Row): Membro {
  const papel = str(row.papel) === "coordenador" ? "coordenador" : "jornalista";
  return {
    userId: str(row.user_id),
    nome: str(row.nome),
    email: str(row.email),
    papel: papel as PapelEscala,
    turnosPermitidos: Array.isArray(row.turnos_permitidos) ? row.turnos_permitidos.map(str) : [],
    ativo: row.ativo !== false,
  };
}

function mapAtribuicao(row: Row): Atribuicao {
  return {
    id: str(row.id),
    userId: str(row.user_id),
    date: str(row.data).slice(0, 10),
    shiftCode: str(row.turno),
    excecao: Boolean(row.excecao),
    excecao_codigos: softCodes(row.excecao_codigos),
    excecao_justificacao: row.excecao_justificacao ? str(row.excecao_justificacao) : null,
    excecao_autorizada_por: row.excecao_autorizada_por ? str(row.excecao_autorizada_por) : null,
  };
}

function mapAusencia(row: Row): Ausencia {
  const tipo = str(row.tipo) === "ausencia" ? "ausencia" : "ferias";
  const estado = str(row.estado);
  return {
    id: str(row.id),
    userId: str(row.user_id),
    date: str(row.data).slice(0, 10),
    tipo,
    estado: estado === "pendente" || estado === "rejeitada" ? estado : "aprovada",
  };
}

function mapSlot(row: Row): Slot {
  return {
    date: str(row.data).slice(0, 10),
    shiftCode: str(row.turno),
    quantidade: Number(row.quantidade) || 0,
  };
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadEstado(
  supabase: SupabaseClient,
  from: string,
  to: string
): Promise<{ estado: EstadoEscala; settings: EscalaSettings; slots: Slot[]; today: string }> {
  const today = todayInLisbon();
  const histFrom = addDays(from < today ? from : today, -90);
  const histTo = addDays(to > today ? to : today, 21);
  const [settingsRes, turnosRes, membrosRes, atribRes, ausRes, slotsRes] = await Promise.all([
    supabase.from("escala_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("escala_turnos").select("*").order("ordem"),
    supabase.from("escala_membros").select("*").eq("ativo", true).order("nome"),
    supabase.from("escala_assignments").select("*").gte("data", histFrom).lte("data", histTo),
    supabase.from("escala_ausencias").select("*").gte("data", histFrom).lte("data", histTo),
    supabase.from("escala_slots").select("*").gte("data", from).lte("data", to),
  ]);
  fail(settingsRes.error);
  fail(turnosRes.error);
  fail(membrosRes.error);
  fail(atribRes.error);
  fail(ausRes.error);
  fail(slotsRes.error);

  const turnos = rows(turnosRes.data).map(mapTurno);
  const estado: EstadoEscala = {
    turnos,
    membros: rows(membrosRes.data).map(mapMembro),
    atribuicoes: rows(atribRes.data).map(mapAtribuicao),
    ausencias: rows(ausRes.data).map(mapAusencia),
  };
  return {
    estado,
    settings: settingsFromRow(settingsRes.data as Parameters<typeof settingsFromRow>[0]),
    slots: rows(slotsRes.data).map(mapSlot),
    today,
  };
}

export async function loadQuadro(
  supabase: SupabaseClient,
  from: string,
  to: string,
  me: { userId: string; nome: string | null; email: string | null },
  podeGerir: boolean
): Promise<QuadroEscala> {
  const { estado, settings, slots, today } = await loadEstado(supabase, from, to);
  const conformidade = estado.membros
    .filter((m) => m.papel === "jornalista")
    .map((m) => conformidadeDe(m.userId, estado, settings, today));
  return {
    ok: true,
    today,
    from,
    to,
    podeGerir,
    me,
    settings,
    turnos: estado.turnos,
    membros: estado.membros,
    atribuicoes: estado.atribuicoes,
    ausencias: estado.ausencias,
    slots,
    conformidade,
  };
}

export async function saveAssignment(supabase: SupabaseClient, assignment: Atribuicao, actorId: string): Promise<void> {
  const { error } = await supabase.from("escala_assignments").upsert(
    {
      id: assignment.id,
      user_id: assignment.userId,
      data: assignment.date,
      turno: assignment.shiftCode,
      excecao: assignment.excecao,
      excecao_codigos: assignment.excecao_codigos,
      excecao_justificacao: assignment.excecao_justificacao,
      excecao_autorizada_por: assignment.excecao_autorizada_por,
      created_by: actorId,
    },
    { onConflict: "id" }
  );
  fail(error);
}

export async function deleteAssignment(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("escala_assignments").delete().eq("id", id);
  fail(error);
}

export async function saveAusencia(
  supabase: SupabaseClient,
  input: { userId: string; date: string; tipo: "ferias" | "ausencia"; actorId: string }
): Promise<void> {
  const { error } = await supabase.from("escala_ausencias").upsert(
    {
      user_id: input.userId,
      data: input.date,
      tipo: input.tipo,
      estado: "aprovada",
      created_by: input.actorId,
    },
    { onConflict: "user_id,data" }
  );
  fail(error);
}

export async function deleteAusencia(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("escala_ausencias").delete().eq("id", id);
  fail(error);
}

export async function saveSettings(
  supabase: SupabaseClient,
  settings: EscalaSettings,
  actorId: string
): Promise<void> {
  const { error } = await supabase.from("escala_settings").upsert(
    { id: 1, ...settingsToRow(settings), updated_by: actorId },
    { onConflict: "id" }
  );
  fail(error);
}
