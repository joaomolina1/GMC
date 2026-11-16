/** Modelo de dados das Escalas (espelha as tabelas escala_* em camelCase). */

export type Periodo = "M" | "T" | "N";
export const PERIODOS: Periodo[] = ["M", "T", "N"];

export type Papel = "TRABALHADOR" | "COORDENADOR" | "ADMINISTRADOR";
export type TipoDia = "SEMANA" | "FDS";
export type Origem = "MANUAL" | "SUGESTAO" | "COPIA" | "MASSA" | "IMPORTACAO";
export type TipoAusencia = "INDISPONIBILIDADE" | "BAIXA" | "FERIAS" | "FOLGA";
export type EstadoAusencia = "PENDENTE" | "APROVADA" | "REJEITADA" | "CANCELADA";

/** Regras flexíveis: o sistema avisa e a coordenação pode forçar com justificação. */
export type RegraCodigo =
  | "DIAS_SEGUIDOS"
  | "FOLGAS"
  | "DESCANSO"
  | "HORAS"
  | "SEM_FDS"
  | "SO_FDS"
  | "PENDENTE"
  | "PIQUETE";

export const REGRA_LABEL: Record<RegraCodigo, string> = {
  DIAS_SEGUIDOS: "dias seguidos",
  FOLGAS: "folgas na janela",
  DESCANSO: "descanso",
  HORAS: "horas semanais",
  SEM_FDS: "fds fora da preferência",
  SO_FDS: "só fds",
  PENDENTE: "pedido pendente",
  PIQUETE: "piquete prolongado",
};

export const TIPO_LABEL: Record<TipoAusencia, string> = {
  INDISPONIBILIDADE: "Indisponibilidade",
  BAIXA: "Baixa médica",
  FERIAS: "Férias",
  FOLGA: "Folga de compensação",
};

export const ESTADO_LABEL: Record<EstadoAusencia, string> = {
  PENDENTE: "pendente",
  APROVADA: "aprovada",
  REJEITADA: "rejeitada",
  CANCELADA: "cancelada",
};

export const PAPEL_LABEL: Record<Papel, string> = {
  TRABALHADOR: "Trabalhador",
  COORDENADOR: "Coordenação",
  ADMINISTRADOR: "Administração",
};

export const ORIGEM_LABEL: Record<Origem, string> = {
  MANUAL: "manual",
  SUGESTAO: "via sugestão",
  COPIA: "copiado",
  MASSA: "em massa",
  IMPORTACAO: "importado",
};

export interface Regras {
  descansoMinimoHoras: number;
  maxDiasConsecutivos: number;
  folgasMinimas: number;
  janelaFolgas: number;
  maxHorasSemanais: number;
  /** Mínimo por período (ex.: 3 manhã + 2 tarde) aplica-se só aos dias úteis. */
  minimoPeriodoSoSemana: boolean;
  fdsFolgasNormal: number;
  fdsFolgasSequencia: number;
  fdsSequenciaMin: number;
  piqueteDiasSeguidos: number;
  piqueteFolgas: number;
  feriasDiasAno: number;
  /** Feriados usam as necessidades de fim de semana. */
  feriadoComoFds: boolean;
}

export interface Grupo {
  id: string;
  nome: string;
  ordem: number;
  estimado: boolean;
  ativo: boolean;
  minimos: Partial<Record<Periodo, number>>;
}

export interface Slot {
  id: string;
  etiqueta: string;
  inicioMin: number;
  /** Pode passar de 1440 (termina no dia seguinte). */
  fimMin: number;
  periodo: Periodo;
  piquete: boolean;
  nota: string;
  ordem: number;
  ativo: boolean;
  horas: number;
}

export interface Necessidade {
  grupoId: string;
  slotId: string;
  tipoDia: TipoDia;
  minimo: number;
  maximo: number;
}

export interface NecessidadeDia {
  data: string;
  grupoId: string;
  slotId: string;
  minimo: number;
  maximo: number;
}

export interface Feriado {
  data: string;
  nome: string;
  ambito: string;
}

export interface Pessoa {
  id: string;
  codigo: string;
  nome: string;
  email: string | null;
  userId: string | null;
  grupoId: string;
  papel: Papel;
  periodos: Periodo[];
  fazFds: boolean;
  todosFds: boolean;
  soFds: boolean;
  integraGrupoId: string | null;
  ciclo7: boolean;
  ativo: boolean;
  notas: string;
  /** Id da pessoa com quem alterna (não podem folgar no mesmo dia). */
  alternaCom: string | null;
  /** Dias de férias por ano (ano → dias). */
  feriasSaldo: Record<string, number>;
}

export interface Turno {
  id: string;
  data: string;
  slotId: string;
  pessoaId: string;
  grupoId: string;
  origem: Origem;
  excecaoRegras: RegraCodigo[];
  excecao: boolean;
  justificacao: string;
  criadoPor: string | null;
  createdAt: string;
}

export interface Anexo {
  id: string;
  caminho: string;
  nome: string;
  tamanho: number;
  tipo: string;
}

export interface Ausencia {
  id: string;
  pessoaId: string;
  tipo: TipoAusencia;
  inicio: string;
  fim: string;
  estado: EstadoAusencia;
  justificacao: string;
  notaDecisao: string;
  excecao: string;
  decididoPor: string | null;
  decididoEm: string | null;
  criadoPor: string | null;
  createdAt: string;
  anexos: Anexo[];
}

/** Tudo o que o motor precisa, sem I/O. */
export interface Dataset {
  regras: Regras;
  periodos: Record<Periodo, string>;
  grupos: Grupo[];
  slots: Slot[];
  necessidades: Necessidade[];
  necessidadesDia: NecessidadeDia[];
  feriados: Feriado[];
  pessoas: Pessoa[];
  turnos: Turno[];
  ausencias: Ausencia[];
}

export interface Sessao {
  userId: string;
  nome: string;
  email: string | null;
  papel: Papel;
  pessoaId: string | null;
  /** Utilizador tem acesso a outras zonas da plataforma além das Escalas. */
  temPlataforma: boolean;
  adminPlataforma: boolean;
}

export const podeCoordenar = (p: Papel | null | undefined) => p === "COORDENADOR" || p === "ADMINISTRADOR";
export const podeAdministrar = (p: Papel | null | undefined) => p === "ADMINISTRADOR";

export interface Aviso {
  code: RegraCodigo;
  message: string;
}

export interface Verificacao {
  hard: string[];
  soft: Aviso[];
}

export interface RegistoEntrada {
  id: number;
  em: string;
  userId: string | null;
  autor: string | null;
  acao: string;
  detalhe: string;
}
