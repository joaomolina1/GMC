import { addDays, formatDayMonth, weekStart } from "./dates";
import { horasContadas, intervaloTurno, turnoByCode } from "./turnos";
import type {
  Ausencia,
  Atribuicao,
  ConstraintWarning,
  EscalaSettings,
  EstadoEscala,
  HardViolation,
  Proposta,
  SoftCode,
  Turno,
} from "./types";

/**
 * Dia de trabalho de uma atribuição.
 * O S6 (17:00–02:00) que começa no dia 10 e termina às 02:00 do dia 11
 * conta só como trabalho do dia 10 — nunca ocupa o dia 11 para folgas
 * nem para a sequência de dias consecutivos.
 */
export function diaDeTrabalho(atribuicao: { date: string }): string {
  return atribuicao.date;
}

export function diasDeTrabalho(atribuicoes: { date: string }[]): Set<string> {
  return new Set(atribuicoes.map((a) => diaDeTrabalho(a)));
}

/** Férias e ausências aprovadas. Pendentes ou rejeitadas não contam. */
export function diasDeAfastamentoAprovado(ausencias: Ausencia[]): Set<string> {
  return new Set(ausencias.filter((a) => a.estado === "aprovada").map((a) => a.date));
}

/**
 * Folga = dia sem turno e sem férias/ausência aprovada.
 * Férias não são folgas: são um afastamento à parte.
 */
export function isFolga(date: string, trabalho: Set<string>, afastamentos: Set<string>): boolean {
  return !trabalho.has(date) && !afastamentos.has(date);
}

export function diasConsecutivosAte(trabalho: Set<string>, date: string): number {
  let n = 0;
  let d = date;
  while (trabalho.has(d)) {
    n += 1;
    d = addDays(d, -1);
    if (n > 400) break;
  }
  return n;
}

/** Folgas na janela deslizante [end - (dias-1), end], inclusive. */
export function folgasNaJanela(
  end: string,
  dias: number,
  trabalho: Set<string>,
  afastamentos: Set<string>
): number {
  let n = 0;
  for (let i = 0; i < dias; i += 1) {
    if (isFolga(addDays(end, -i), trabalho, afastamentos)) n += 1;
  }
  return n;
}

export function horasNaSemana(diasTrabalho: Iterable<string>, date: string, settings: EscalaSettings): number {
  const start = weekStart(date);
  const end = addDays(start, 6);
  let n = 0;
  for (const d of diasTrabalho) {
    if (d >= start && d <= end) n += 1;
  }
  // Cada turno conta `duracaoPadraoTurnoHoras`. As horas de relógio a mais do S6 ignoram-se.
  return n * horasContadas(settings);
}

/** Variância dos intervalos entre folgas. 0 = perfeitamente regulares (ou menos de 2 folgas). */
export function varianciaIntervalosFolgas(
  trabalho: Set<string>,
  afastamentos: Set<string>,
  windowEnd: string,
  windowDays: number
): number {
  const positions: number[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const date = addDays(windowEnd, -(windowDays - 1 - i));
    if (isFolga(date, trabalho, afastamentos)) positions.push(i);
  }
  if (positions.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i += 1) gaps.push(positions[i] - positions[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
}

function formatHoras(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function piorJanelaDeFolgas(
  date: string,
  settings: EscalaSettings,
  trabalho: Set<string>,
  afastamentos: Set<string>
): { count: number; start: string; end: string } {
  const janela = settings.janelaFolgasDias;
  let worst = { count: Number.POSITIVE_INFINITY, start: date, end: date };
  for (let i = 0; i < janela; i += 1) {
    const end = addDays(date, i);
    const start = addDays(end, -(janela - 1));
    const count = folgasNaJanela(end, janela, trabalho, afastamentos);
    if (count < worst.count) worst = { count, start, end };
  }
  return worst;
}

function descansoEntre(
  anterior: { date: string; shiftCode: string },
  seguinte: { date: string; shiftCode: string },
  turnos: Turno[]
): number | null {
  const a = turnoByCode(anterior.shiftCode, turnos);
  const b = turnoByCode(seguinte.shiftCode, turnos);
  if (!a || !b) return null;
  const ia = intervaloTurno(anterior.date, a);
  const ib = intervaloTurno(seguinte.date, b);
  return (ib.inicio - ia.fim) / 60;
}

export function avaliarAtribuicao(
  estado: EstadoEscala,
  proposta: Proposta,
  settings: EscalaSettings,
  opts?: { ignorarAtribuicaoId?: string }
): { hard: HardViolation[]; warnings: ConstraintWarning[] } {
  const hard: HardViolation[] = [];
  const membro = estado.membros.find((m) => m.userId === proposta.userId);
  const turno = turnoByCode(proposta.shiftCode, estado.turnos);

  if (!membro || !membro.ativo || membro.papel !== "jornalista") {
    hard.push({
      code: "FORA_DO_PERFIL",
      severity: "HARD",
      userId: proposta.userId,
      date: proposta.date,
      message: "Sem perfil de jornalista ativo",
      detail: "Só um jornalista ativo pode receber um turno.",
    });
  } else if (!turno || !membro.turnosPermitidos.includes(proposta.shiftCode)) {
    hard.push({
      code: "FORA_DO_PERFIL",
      severity: "HARD",
      userId: proposta.userId,
      date: proposta.date,
      message: turno ? `Turno ${proposta.shiftCode} fora do perfil` : `Turno ${proposta.shiftCode} desconhecido`,
      detail: turno
        ? `${membro.nome} não tem ${turno.nome} (${turno.code}) no perfil.`
        : "Este turno não existe no catálogo.",
    });
  }

  const afastamento = estado.ausencias.find(
    (a) => a.userId === proposta.userId && a.date === proposta.date && a.estado === "aprovada"
  );
  if (afastamento) {
    const ferias = afastamento.tipo === "ferias";
    hard.push({
      code: "AUSENCIA_APROVADA",
      severity: "HARD",
      userId: proposta.userId,
      date: proposta.date,
      message: ferias ? "Férias aprovadas neste dia" : "Ausência aprovada neste dia",
      detail: ferias
        ? "Férias e folgas são distintas. Um dia de férias aprovadas não leva turno."
        : "Há uma ausência aprovada sobreposta a este dia.",
    });
  }

  const existente = estado.atribuicoes.find(
    (a) =>
      a.userId === proposta.userId &&
      a.date === proposta.date &&
      a.id !== opts?.ignorarAtribuicaoId
  );
  if (existente) {
    hard.push({
      code: "TURNO_DUPLICADO",
      severity: "HARD",
      userId: proposta.userId,
      date: proposta.date,
      message: "Já tem um turno neste dia",
      detail: `Já está em ${existente.shiftCode}. Só pode haver um turno por dia.`,
    });
  }

  if (hard.length > 0 || !turno) return { hard, warnings: [] };

  const proprias = estado.atribuicoes.filter(
    (a) => a.userId === proposta.userId && a.id !== opts?.ignorarAtribuicaoId
  );
  const comNova: Atribuicao[] = [
    ...proprias,
    {
      id: opts?.ignorarAtribuicaoId ?? "proposta",
      userId: proposta.userId,
      date: proposta.date,
      shiftCode: proposta.shiftCode,
      excecao: false,
      excecao_codigos: [],
      excecao_justificacao: null,
      excecao_autorizada_por: null,
    },
  ];
  const trabalho = diasDeTrabalho(comNova);
  const afastamentos = diasDeAfastamentoAprovado(
    estado.ausencias.filter((a) => a.userId === proposta.userId)
  );
  const warnings: ConstraintWarning[] = [];

  const consecutivos = diasConsecutivosAte(trabalho, proposta.date);
  if (consecutivos > settings.maxDiasConsecutivos) {
    warnings.push({
      code: "MAX_DIAS_CONSECUTIVOS",
      severity: "SOFT",
      userId: proposta.userId,
      date: proposta.date,
      message: `${consecutivos}.º dia consecutivo de trabalho`,
      detail: `limite de ${settings.maxDiasConsecutivos} dias consecutivos`,
    });
  }

  const janela = piorJanelaDeFolgas(proposta.date, settings, trabalho, afastamentos);
  if (janela.count < settings.folgasMinimasPor14Dias) {
    warnings.push({
      code: "FOLGAS_INSUFICIENTES",
      severity: "SOFT",
      userId: proposta.userId,
      date: proposta.date,
      message: `Folgas insuficientes numa janela de ${settings.janelaFolgasDias} dias`,
      detail: `apenas ${janela.count} ${janela.count === 1 ? "folga" : "folgas"} entre ${formatDayMonth(janela.start)} e ${formatDayMonth(janela.end)}`,
    });
  }

  const ordenadas = [...comNova].sort((a, b) => {
    const ta = turnoByCode(a.shiftCode, estado.turnos);
    const tb = turnoByCode(b.shiftCode, estado.turnos);
    if (!ta || !tb) return a.date < b.date ? -1 : 1;
    return intervaloTurno(a.date, ta).inicio - intervaloTurno(b.date, tb).inicio;
  });
  const idx = ordenadas.findIndex((a) => a.date === proposta.date && a.shiftCode === proposta.shiftCode);
  const vizinhos: Array<["antes" | "depois", Atribuicao]> = [];
  if (idx > 0) vizinhos.push(["antes", ordenadas[idx - 1]]);
  if (idx >= 0 && idx < ordenadas.length - 1) vizinhos.push(["depois", ordenadas[idx + 1]]);

  for (const [lado, outro] of vizinhos) {
    const horas =
      lado === "antes"
        ? descansoEntre(outro, proposta, estado.turnos)
        : descansoEntre(proposta, outro, estado.turnos);
    if (horas == null || horas >= settings.descansoMinimoHoras) continue;
    const turnoOutro = turnoByCode(outro.shiftCode, estado.turnos);
    warnings.push({
      code: "DESCANSO_INSUFICIENTE",
      severity: "SOFT",
      userId: proposta.userId,
      date: proposta.date,
      message: `Descanso inferior a ${formatHoras(settings.descansoMinimoHoras)}h entre turnos`,
      detail:
        lado === "antes"
          ? `${formatHoras(horas)}h entre ${outro.shiftCode} de ${formatDayMonth(outro.date)} (termina ${turnoOutro?.fim ?? ""}) e ${proposta.shiftCode} de ${formatDayMonth(proposta.date)}`
          : `${formatHoras(horas)}h entre ${proposta.shiftCode} de ${formatDayMonth(proposta.date)} (termina ${turno.fim}) e ${outro.shiftCode} de ${formatDayMonth(outro.date)}`,
    });
  }

  const horasSemana = horasNaSemana(trabalho, proposta.date, settings);
  if (horasSemana > settings.maxHorasSemanais) {
    warnings.push({
      code: "HORAS_SEMANAIS",
      severity: "SOFT",
      userId: proposta.userId,
      date: proposta.date,
      message: "Horas semanais acima do limite",
      detail: `${formatHoras(horasSemana)}h na semana de ${formatDayMonth(weekStart(proposta.date))} (limite ${formatHoras(settings.maxHorasSemanais)}h)`,
    });
  }

  return { hard, warnings };
}

export function codigosSoft(warnings: ConstraintWarning[]): SoftCode[] {
  const seen = new Set<SoftCode>();
  const out: SoftCode[] = [];
  for (const w of warnings) {
    if (seen.has(w.code)) continue;
    seen.add(w.code);
    out.push(w.code);
  }
  return out;
}
