import { avaliarAtribuicao, codigosSoft, varianciaIntervalosFolgas, diasConsecutivosAte, diasDeAfastamentoAprovado, diasDeTrabalho, folgasNaJanela, horasNaSemana } from "./constraints";
import type { Atribuicao, ConstraintWarning, EscalaSettings, EstadoEscala, Slot } from "./types";

export type AtribuicaoSugerida = {
  userId: string;
  date: string;
  shiftCode: string;
  excecao: boolean;
  warnings: ConstraintWarning[];
};

export type BloqueioSugestao = {
  userId: string;
  date: string;
  shiftCode: string;
  code: string;
  message: string;
};

export type ResultadoSugestao = {
  atribuicoes: AtribuicaoSugerida[];
  /** HARD saltados. Só entram quando o lugar ficou por preencher — explicam o vazio. */
  bloqueios: BloqueioSugestao[];
  porPreencher: { date: string; shiftCode: string }[];
};

function lugaresPorPreencher(slots: Slot[], atribuicoes: Atribuicao[]): { date: string; shiftCode: string }[] {
  const contagem = new Map<string, number>();
  for (const a of atribuicoes) {
    const key = `${a.date}|${a.shiftCode}`;
    contagem.set(key, (contagem.get(key) ?? 0) + 1);
  }
  const lugares: { date: string; shiftCode: string }[] = [];
  const ordenados = [...slots].sort((a, b) =>
    a.date === b.date ? a.shiftCode.localeCompare(b.shiftCode) : a.date < b.date ? -1 : 1
  );
  for (const slot of ordenados) {
    const preenchidos = contagem.get(`${slot.date}|${slot.shiftCode}`) ?? 0;
    const emFalta = Math.max(0, slot.quantidade - preenchidos);
    for (let i = 0; i < emFalta; i += 1) lugares.push({ date: slot.date, shiftCode: slot.shiftCode });
  }
  return lugares;
}

function pontuar(
  userId: string,
  date: string,
  pending: Atribuicao[],
  estado: EstadoEscala,
  settings: EscalaSettings
): number {
  const proprias = pending.filter((a) => a.userId === userId);
  const trabalho = diasDeTrabalho(proprias);
  const afastamentos = diasDeAfastamentoAprovado(estado.ausencias.filter((a) => a.userId === userId));
  const streak = diasConsecutivosAte(trabalho, date);
  const folgas = folgasNaJanela(date, settings.janelaFolgasDias, trabalho, afastamentos);
  const horas = horasNaSemana(trabalho, date, settings);
  const total = proprias.length;
  if (settings.preferirFolgasAgrupadas) {
    return streak * 1000 - folgas * 25 - horas - total;
  }
  const variancia = varianciaIntervalosFolgas(trabalho, afastamentos, date, settings.janelaFolgasDias);
  // Peso alto em sequências curtas e folgas espaçadas — evita 7 dias seguidos + bloco de folgas.
  return -streak * 1000 + folgas * 40 - variancia * 80 - horas * 2 - total * 5;
}

/**
 * Nunca propõe uma violação SOFT se houver candidato limpo.
 * Com escassez, propõe a exceção em vez de deixar o lugar vazio.
 * Nunca propõe uma violação HARD.
 */
export function sugerirEscala(estado: EstadoEscala, slots: Slot[], settings: EscalaSettings): ResultadoSugestao {
  const pending: Atribuicao[] = estado.atribuicoes.map((a) => ({ ...a }));
  const atribuicoes: AtribuicaoSugerida[] = [];
  const bloqueios: BloqueioSugestao[] = [];
  const porPreencher: { date: string; shiftCode: string }[] = [];
  const jornalistas = estado.membros
    .filter((m) => m.ativo && m.papel === "jornalista")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  for (const lugar of lugaresPorPreencher(slots, pending)) {
    const estadoActual: EstadoEscala = { ...estado, atribuicoes: pending };
    const classificados = jornalistas.map((membro) => {
      const avaliacao = avaliarAtribuicao(
        estadoActual,
        { userId: membro.userId, date: lugar.date, shiftCode: lugar.shiftCode },
        settings
      );
      return { membro, ...avaliacao };
    });
    const limpos = classificados.filter((c) => c.hard.length === 0 && c.warnings.length === 0);
    const excecoes = classificados.filter((c) => c.hard.length === 0 && c.warnings.length > 0);
    const pool = limpos.length > 0 ? limpos : excecoes;

    if (pool.length === 0) {
      porPreencher.push({ date: lugar.date, shiftCode: lugar.shiftCode });
      for (const c of classificados) {
        for (const h of c.hard) {
          bloqueios.push({
            userId: c.membro.userId,
            date: lugar.date,
            shiftCode: lugar.shiftCode,
            code: h.code,
            message: h.message,
          });
        }
      }
      continue;
    }

    pool.sort((a, b) => {
      const score =
        pontuar(b.membro.userId, lugar.date, [...pending, rascunho(b.membro.userId, lugar)], estado, settings) -
        pontuar(a.membro.userId, lugar.date, [...pending, rascunho(a.membro.userId, lugar)], estado, settings);
      if (score !== 0) return score;
      return a.membro.nome.localeCompare(b.membro.nome, "pt");
    });

    const escolhido = pool[0];
    const excecao = escolhido.warnings.length > 0;
    pending.push({
      id: `sug-${lugar.date}-${lugar.shiftCode}-${escolhido.membro.userId}`,
      userId: escolhido.membro.userId,
      date: lugar.date,
      shiftCode: lugar.shiftCode,
      excecao,
      excecao_codigos: codigosSoft(escolhido.warnings),
      excecao_justificacao: null,
      excecao_autorizada_por: null,
    });
    atribuicoes.push({
      userId: escolhido.membro.userId,
      date: lugar.date,
      shiftCode: lugar.shiftCode,
      excecao,
      warnings: escolhido.warnings,
    });
  }

  return { atribuicoes, bloqueios, porPreencher };
}

function rascunho(userId: string, lugar: { date: string; shiftCode: string }): Atribuicao {
  return {
    id: "score",
    userId,
    date: lugar.date,
    shiftCode: lugar.shiftCode,
    excecao: false,
    excecao_codigos: [],
    excecao_justificacao: null,
    excecao_autorizada_por: null,
  };
}

export function atribuicoesAConfirmar<T extends { excecao: boolean }>(items: T[], excluirAvisos: boolean): T[] {
  return excluirAvisos ? items.filter((item) => !item.excecao) : items;
}
