import { avaliarAtribuicao, codigosSoft } from "./constraints";
import type { Atribuicao, AuditEntry, ConstraintWarning, EscalaSettings, EstadoEscala, HardViolation, Proposta } from "./types";

export type PedidoAtribuicao = Proposta & {
  override?: boolean;
  justificacao?: string;
  actorId: string;
  existenteId?: string;
};

export type ResultadoAtribuicao =
  | { ok: true; assignment: Atribuicao; warnings: ConstraintWarning[] }
  | {
      ok: false;
      status: 409 | 422;
      hard: HardViolation[];
      warnings: ConstraintWarning[];
      error?: string;
    };

export function metadadosExcecao(assignment: Atribuicao): Record<string, unknown> {
  return {
    userId: assignment.userId,
    date: assignment.date,
    turno: assignment.shiftCode,
    excecao: true,
    excecao_codigos: assignment.excecao_codigos,
    excecao_justificacao: assignment.excecao_justificacao,
    excecao_autorizada_por: assignment.excecao_autorizada_por,
  };
}

/**
 * Decide se a atribuição pode ser gravada.
 * HARD nunca grava. SOFT só grava com override e justificação não vazia,
 * e nesse caso deixa justificação, autor e códigos prontos para o audit_log.
 */
export function commitAssignment(
  estado: EstadoEscala,
  pedido: PedidoAtribuicao,
  settings: EscalaSettings,
  audit?: (entry: AuditEntry) => void,
  ids?: { createId?: () => string }
): ResultadoAtribuicao {
  const avaliacao = avaliarAtribuicao(estado, pedido, settings, {
    ignorarAtribuicaoId: pedido.existenteId,
  });
  if (avaliacao.hard.length > 0) {
    return { ok: false, status: 422, hard: avaliacao.hard, warnings: [] };
  }
  if (avaliacao.warnings.length > 0 && !pedido.override) {
    return { ok: false, status: 409, hard: [], warnings: avaliacao.warnings };
  }
  const justificacao = pedido.justificacao?.trim() ?? "";
  if (avaliacao.warnings.length > 0 && !justificacao) {
    return {
      ok: false,
      status: 422,
      hard: [],
      warnings: avaliacao.warnings,
      error: "A justificação é obrigatória para gravar uma exceção.",
    };
  }

  const excecao = avaliacao.warnings.length > 0;
  const assignment: Atribuicao = {
    id: pedido.existenteId ?? ids?.createId?.() ?? crypto.randomUUID(),
    userId: pedido.userId,
    date: pedido.date,
    shiftCode: pedido.shiftCode,
    excecao,
    excecao_codigos: excecao ? codigosSoft(avaliacao.warnings) : [],
    excecao_justificacao: excecao ? justificacao : null,
    excecao_autorizada_por: excecao ? pedido.actorId : null,
  };

  audit?.({
    actorId: pedido.actorId,
    action: excecao ? "escala.assignment.exception" : "escala.assignment.create",
    entityType: "escala_assignments",
    entityId: assignment.id,
    metadata: excecao
      ? metadadosExcecao(assignment)
      : {
          userId: assignment.userId,
          date: assignment.date,
          turno: assignment.shiftCode,
          excecao: false,
        },
  });

  return { ok: true, assignment, warnings: avaliacao.warnings };
}
