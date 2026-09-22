import { addDays } from "./dates";
import type { Atribuicao, Ausencia, Membro, Slot, SoftCode } from "./types";

/** Contas de demonstração. A palavra-passe fica só no script de seed, nunca no cliente. */
export const DEMO_EQUIPA: Array<Membro & { id: string }> = [
  pessoa("a11a0001-0000-4000-8000-000000000001", "Rita Mendes", "rita.mendes@escalas.gmc.pt", "coordenador", []),
  pessoa("a11a0001-0000-4000-8000-000000000002", "Pedro Nunes", "pedro.nunes@escalas.gmc.pt", "coordenador", []),
  pessoa("a11a0001-0000-4000-8000-000000000003", "Ana Silva", "ana.silva@escalas.gmc.pt", "jornalista", ["S1", "S2"]),
  pessoa("a11a0001-0000-4000-8000-000000000004", "Bruno Oliveira", "bruno.oliveira@escalas.gmc.pt", "jornalista", ["S3", "S4"]),
  pessoa("a11a0001-0000-4000-8000-000000000005", "Carla Ferreira", "carla.ferreira@escalas.gmc.pt", "jornalista", ["S5", "S6"]),
  pessoa("a11a0001-0000-4000-8000-000000000006", "Diogo Santos", "diogo.santos@escalas.gmc.pt", "jornalista", ["S1", "S2", "S3", "S4", "S5", "S6"]),
  pessoa("a11a0001-0000-4000-8000-000000000007", "Eva Martins", "eva.martins@escalas.gmc.pt", "jornalista", ["S1", "S2"]),
  pessoa("a11a0001-0000-4000-8000-000000000008", "Filipe Rodrigues", "filipe.rodrigues@escalas.gmc.pt", "jornalista", ["S3", "S5", "S6"]),
];

export const DEMO_RITA = DEMO_EQUIPA[0].userId;
const ANA = DEMO_EQUIPA[2].userId;
const BRUNO = DEMO_EQUIPA[3].userId;
const CARLA = DEMO_EQUIPA[4].userId;
const DIOGO = DEMO_EQUIPA[5].userId;
const EVA = DEMO_EQUIPA[6].userId;
const FILIPE = DEMO_EQUIPA[7].userId;

function pessoa(
  userId: string,
  nome: string,
  email: string,
  papel: Membro["papel"],
  turnosPermitidos: string[]
): Membro & { id: string } {
  return { id: userId, userId, nome, email, papel, turnosPermitidos, ativo: true };
}

function atrib(
  userId: string,
  date: string,
  shiftCode: string,
  excecao?: { codigos: SoftCode[]; justificacao: string }
): Atribuicao {
  return {
    id: `demo-${userId.slice(0, 8)}-${date}-${shiftCode}`,
    userId,
    date,
    shiftCode,
    excecao: Boolean(excecao),
    excecao_codigos: excecao?.codigos ?? [],
    excecao_justificacao: excecao?.justificacao ?? null,
    excecao_autorizada_por: excecao ? DEMO_RITA : null,
  };
}

function dias(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Ana: dois dias de trabalho, um de folga. A sequência nunca chega a sete. */
function diasAna(): string[] {
  const out: string[] = [];
  let run = 0;
  for (const date of dias("2026-09-14", "2026-09-27")) {
    if (run < 2) {
      out.push(date);
      run += 1;
    } else {
      run = 0;
    }
  }
  return out;
}

/** Diogo: 11 dias de trabalho e 3 folgas em 9–22 set, sem oito dias seguidos. */
function diasDiogo(): string[] {
  const folgas = new Set(["2026-09-13", "2026-09-18", "2026-09-22"]);
  return dias("2026-09-09", "2026-09-21").filter((date) => !folgas.has(date));
}

export function buildDemo(): {
  membros: Membro[];
  atribuicoes: Atribuicao[];
  ausencias: Ausencia[];
  slots: Slot[];
} {
  const atribuicoes: Atribuicao[] = [
    ...diasAna().map((date) => atrib(ANA, date, "S1")),
    ...dias("2026-09-15", "2026-09-19").map((date) => atrib(BRUNO, date, "S3")),
    atrib(BRUNO, "2026-09-20", "S3", {
      codigos: ["HORAS_SEMANAIS"],
      justificacao: "Fecho de semana com baixa na tarde. Autorizado para não deixar o bloco por preencher.",
    }),
    atrib(BRUNO, "2026-09-21", "S3"),
    atrib(CARLA, "2026-09-21", "S6"),
    atrib(CARLA, "2026-09-24", "S5"),
    ...diasDiogo()
      .filter((date) => date !== "2026-09-20" && date !== "2026-09-21")
      .map((date) => atrib(DIOGO, date, "S5")),
    atrib(DIOGO, "2026-09-20", "S5", {
      codigos: ["HORAS_SEMANAIS"],
      justificacao: "Semana de eleições. O limite de horas foi ultrapassado com cobertura combinada.",
    }),
    atrib(DIOGO, "2026-09-21", "S5", {
      codigos: ["FOLGAS_INSUFICIENTES"],
      justificacao: "A janela de 14 dias ficou com menos de 4 folgas. Mantido para fechar a noite.",
    }),
    atrib(EVA, "2026-09-21", "S2"),
    atrib(EVA, "2026-09-22", "S2"),
    atrib(FILIPE, "2026-09-18", "S6"),
    atrib(FILIPE, "2026-09-19", "S3", {
      codigos: ["DESCANSO_INSUFICIENTE"],
      justificacao: "Saiu do fecho às 02:00 e entrou à tarde. Descanso curto autorizado pela coordenação.",
    }),
  ];

  const ausencias: Ausencia[] = dias("2026-09-23", "2026-09-25").map((date) => ({
    id: `demo-eva-ferias-${date}`,
    userId: EVA,
    date,
    tipo: "ferias",
    estado: "aprovada",
  }));

  const slots: Slot[] = [];
  for (const date of dias("2026-09-21", "2026-09-25")) {
    for (const shiftCode of ["S1", "S3", "S5", "S6"]) {
      slots.push({ date, shiftCode, quantidade: 1 });
    }
  }

  return {
    membros: DEMO_EQUIPA.map(({ id: _id, ...membro }) => membro),
    atribuicoes,
    ausencias,
    slots,
  };
}
