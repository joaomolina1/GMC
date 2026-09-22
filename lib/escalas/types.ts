/** Gravidade das restrições da escala.
 * HARD — o sistema nunca cria nem permite gravar.
 * SOFT — avisa, o motor evita, o coordenador pode forçar com justificação.
 */
export type ConstraintSeverity = "HARD" | "SOFT";

export type SoftCode =
  | "MAX_DIAS_CONSECUTIVOS"
  | "FOLGAS_INSUFICIENTES"
  | "DESCANSO_INSUFICIENTE"
  | "HORAS_SEMANAIS";

export type HardCode = "FORA_DO_PERFIL" | "AUSENCIA_APROVADA" | "TURNO_DUPLICADO";

export type ConstraintWarning = {
  code: SoftCode;
  severity: "SOFT";
  userId: string;
  date: string;
  message: string;
  detail: string;
};

export type HardViolation = {
  code: HardCode;
  severity: "HARD";
  userId: string;
  date: string;
  message: string;
  detail: string;
};

export type PapelEscala = "jornalista" | "coordenador";

export type Turno = {
  code: string;
  nome: string;
  /** HH:MM, hora local de Lisboa. */
  inicio: string;
  fim: string;
  atravessaMeiaNoite: boolean;
  ordem: number;
};

export type Membro = {
  userId: string;
  nome: string;
  email: string;
  papel: PapelEscala;
  turnosPermitidos: string[];
  ativo: boolean;
};

export type Atribuicao = {
  id: string;
  userId: string;
  /** Dia de trabalho. O S6 conta neste dia, não no dia em que termina. */
  date: string;
  shiftCode: string;
  excecao: boolean;
  excecao_codigos: SoftCode[];
  excecao_justificacao: string | null;
  excecao_autorizada_por: string | null;
};

export type TipoAfastamento = "ferias" | "ausencia";
export type EstadoAfastamento = "pendente" | "aprovada" | "rejeitada";

export type Ausencia = {
  id: string;
  userId: string;
  date: string;
  tipo: TipoAfastamento;
  estado: EstadoAfastamento;
};

export type Slot = {
  date: string;
  shiftCode: string;
  quantidade: number;
};

/** Tudo o que o motor precisa para avaliar, sem I/O. */
export type EstadoEscala = {
  membros: Membro[];
  atribuicoes: Atribuicao[];
  ausencias: Ausencia[];
  turnos: Turno[];
};

export type EscalaSettings = {
  maxDiasConsecutivos: number;
  folgasMinimasPor14Dias: number;
  janelaFolgasDias: number;
  descansoMinimoHoras: number;
  duracaoPadraoTurnoHoras: number;
  /** Não vem da lista original de chaves, mas o aviso HORAS_SEMANAIS precisa de um tecto. */
  maxHorasSemanais: number;
  preferirFolgasAgrupadas: boolean;
};

export type Proposta = {
  userId: string;
  date: string;
  shiftCode: string;
};

export type ConformidadeResumo = {
  userId: string;
  diasConsecutivosHoje: number;
  ultimoBlocoDias: number;
  ultimoBlocoAte: string | null;
  folgasUltimos14Dias: number;
  feriasUltimos14Dias: number;
  horasSemana: number;
  abaixoDoNecessario: boolean;
  excecoes: {
    id: string;
    date: string;
    shiftCode: string;
    codigos: SoftCode[];
    justificacao: string | null;
    autorizadaPor: string | null;
    autorizadaPorNome: string | null;
  }[];
};

export type QuadroEscala = {
  ok: true;
  today: string;
  from: string;
  to: string;
  podeGerir: boolean;
  me: { userId: string; nome: string | null; email: string | null };
  settings: EscalaSettings;
  turnos: Turno[];
  membros: Membro[];
  atribuicoes: Atribuicao[];
  ausencias: Ausencia[];
  slots: Slot[];
  conformidade: ConformidadeResumo[];
};

export type AuditEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata: Record<string, unknown>;
};
