import { addDays } from "./dates";
import {
  diasConsecutivosAte,
  diasDeAfastamentoAprovado,
  diasDeTrabalho,
  folgasNaJanela,
  horasNaSemana,
} from "./constraints";
import type { Atribuicao, EscalaSettings, EstadoEscala, SoftCode } from "./types";

export type ExcecaoHistorico = {
  id: string;
  date: string;
  shiftCode: string;
  codigos: SoftCode[];
  justificacao: string | null;
  autorizadaPor: string | null;
  autorizadaPorNome: string | null;
};

export type Conformidade = {
  userId: string;
  /** Sequência que termina hoje. 0 se hoje não tem turno. */
  diasConsecutivosHoje: number;
  /** Último bloco de trabalho até hoje, mesmo que hoje já seja folga. */
  ultimoBlocoDias: number;
  ultimoBlocoAte: string | null;
  folgasUltimos14Dias: number;
  feriasUltimos14Dias: number;
  horasSemana: number;
  abaixoDoNecessario: boolean;
  excecoes: ExcecaoHistorico[];
};

function ultimoBloco(trabalho: Set<string>, ref: string): { dias: number; ate: string | null } {
  let d = ref;
  for (let i = 0; i < 120 && !trabalho.has(d); i += 1) d = addDays(d, -1);
  if (!trabalho.has(d)) return { dias: 0, ate: null };
  return { dias: diasConsecutivosAte(trabalho, d), ate: d };
}

export function conformidadeDe(
  userId: string,
  estado: EstadoEscala,
  settings: EscalaSettings,
  ref: string
): Conformidade {
  const proprias = estado.atribuicoes.filter((a) => a.userId === userId);
  const trabalho = diasDeTrabalho(proprias);
  const ausencias = estado.ausencias.filter((a) => a.userId === userId);
  const afastamentos = diasDeAfastamentoAprovado(ausencias);
  const bloco = ultimoBloco(trabalho, ref);
  const hoje = diasConsecutivosAte(trabalho, ref);
  const folgas = folgasNaJanela(ref, settings.janelaFolgasDias, trabalho, afastamentos);
  let ferias = 0;
  for (let i = 0; i < settings.janelaFolgasDias; i += 1) {
    const d = addDays(ref, -i);
    if (ausencias.some((a) => a.date === d && a.estado === "aprovada" && a.tipo === "ferias")) ferias += 1;
  }
  const horas = horasNaSemana(trabalho, ref, settings);
  const nomes = new Map(estado.membros.map((m) => [m.userId, m.nome]));
  const excecoes = proprias
    .filter((a) => a.excecao)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => historicoDe(a, nomes));

  return {
    userId,
    diasConsecutivosHoje: hoje,
    ultimoBlocoDias: bloco.dias,
    ultimoBlocoAte: bloco.ate,
    folgasUltimos14Dias: folgas,
    feriasUltimos14Dias: ferias,
    horasSemana: horas,
    abaixoDoNecessario:
      hoje > settings.maxDiasConsecutivos ||
      folgas < settings.folgasMinimasPor14Dias ||
      horas > settings.maxHorasSemanais,
    excecoes,
  };
}

function historicoDe(a: Atribuicao, nomes: Map<string, string>): ExcecaoHistorico {
  return {
    id: a.id,
    date: a.date,
    shiftCode: a.shiftCode,
    codigos: a.excecao_codigos,
    justificacao: a.excecao_justificacao,
    autorizadaPor: a.excecao_autorizada_por,
    autorizadaPorNome: a.excecao_autorizada_por ? (nomes.get(a.excecao_autorizada_por) ?? null) : null,
  };
}
