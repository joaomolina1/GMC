import { describe, expect, it } from "vitest";
import { addDays, dRange, isoWeek, mondayOf } from "@lib/escalas/datas";
import { Motor } from "@lib/escalas/motor";
import type { Ausencia, Dataset, Periodo, Pessoa, Turno } from "@lib/escalas/tipos";
import { acessoDeMetadata, featureDoCaminho, homeDoUtilizador, podeUsar } from "@lib/features";

// Segunda-feira 2027-01-04 (semana sem feriados).
const WS = "2027-01-04";

function pessoa(id: string, grupoId: string, periodos: Periodo[], extra: Partial<Pessoa> = {}): Pessoa {
  return {
    id,
    codigo: id,
    nome: id.toUpperCase(),
    email: null,
    userId: null,
    grupoId,
    papel: "TRABALHADOR",
    periodos,
    fazFds: true,
    todosFds: false,
    soFds: false,
    integraGrupoId: null,
    ciclo7: false,
    ativo: true,
    notas: "",
    alternaCom: null,
    feriasSaldo: {},
    ...extra,
  };
}

let seq = 0;
const turno = (pessoaId: string, data: string, slotId: string, grupoId = "RED"): Turno => ({
  id: `t${++seq}`,
  data,
  slotId,
  pessoaId,
  grupoId,
  origem: "MANUAL",
  excecaoRegras: [],
  excecao: false,
  justificacao: "",
  criadoPor: null,
  createdAt: "",
});

const ausencia = (pessoaId: string, inicio: string, fim: string, extra: Partial<Ausencia> = {}): Ausencia => ({
  id: `a${++seq}`,
  pessoaId,
  tipo: "FERIAS",
  inicio,
  fim,
  estado: "APROVADA",
  justificacao: "",
  notaDecisao: "",
  excecao: "",
  decididoPor: null,
  decididoEm: null,
  criadoPor: null,
  createdAt: "",
  anexos: [],
  ...extra,
});

function base(over: Partial<Dataset> = {}): Dataset {
  return {
    regras: {
      descansoMinimoHoras: 12,
      maxDiasConsecutivos: 7,
      folgasMinimas: 4,
      janelaFolgas: 14,
      maxHorasSemanais: 40,
      minimoPeriodoSoSemana: true,
      fdsFolgasNormal: 2,
      fdsFolgasSequencia: 3,
      fdsSequenciaMin: 3,
      piqueteDiasSeguidos: 7,
      piqueteFolgas: 3,
      feriasDiasAno: 22,
      feriadoComoFds: false,
    },
    periodos: { M: "Manhã", T: "Tarde", N: "Noite" },
    grupos: [{ id: "RED", nome: "Redação", ordem: 1, estimado: false, ativo: true, minimos: { M: 1 } }],
    slots: [
      { id: "S1", etiqueta: "07–15", inicioMin: 420, fimMin: 900, periodo: "M", piquete: false, nota: "", ordem: 1, ativo: true, horas: 8 },
      { id: "S5", etiqueta: "13–21", inicioMin: 780, fimMin: 1260, periodo: "T", piquete: false, nota: "", ordem: 2, ativo: true, horas: 8 },
      { id: "S8", etiqueta: "17–01", inicioMin: 1020, fimMin: 1500, periodo: "N", piquete: true, nota: "", ordem: 3, ativo: true, horas: 8 },
    ],
    necessidades: [
      { grupoId: "RED", slotId: "S1", tipoDia: "SEMANA", minimo: 1, maximo: 1 },
      { grupoId: "RED", slotId: "S1", tipoDia: "FDS", minimo: 1, maximo: 1 },
    ],
    necessidadesDia: [],
    feriados: [],
    pessoas: [pessoa("ana", "RED", ["M"]), pessoa("rui", "RED", ["M", "T", "N"])],
    turnos: [],
    ausencias: [],
    ...over,
  };
}

describe("datas", () => {
  it("semanas começam à segunda e numeração ISO", () => {
    expect(mondayOf("2027-01-10")).toBe(WS);
    expect(isoWeek(WS)).toBe(1);
    expect(dRange(WS, addDays(WS, 6))).toHaveLength(7);
  });
});

describe("regras rígidas", () => {
  it("bloqueia período fora do perfil, ausência aprovada e segundo turno no mesmo dia", () => {
    const m = new Motor(base({ ausencias: [ausencia("ana", WS, WS)], turnos: [turno("rui", WS, "S1")] }));
    expect(m.hardOf("ana", addDays(WS, 1), "S5")[0]).toMatch(/Preferência/);
    expect(m.hardOf("ana", WS, "S1")[0]).toMatch(/Férias aprovadas/);
    expect(m.hardOf("rui", WS, "S5")[0]).toMatch(/Já tem 07–15/);
    expect(m.hardOf("rui", WS, "S1")).toEqual(["Já está neste slot"]);
  });
});

describe("regras flexíveis", () => {
  it("avisa descanso insuficiente entre noite e manhã", () => {
    const m = new Motor(base({ turnos: [turno("rui", WS, "S8")] }));
    const v = m.verificar("rui", addDays(WS, 1), "S1");
    expect(v.hard).toEqual([]);
    expect(v.soft.map((w) => w.code)).toContain("DESCANSO");
  });

  it("avisa mais de 7 dias seguidos e horas semanais acima do limite", () => {
    const turnos = dRange(WS, addDays(WS, 6)).map((d) => turno("ana", d, "S1"));
    const m = new Motor(base({ turnos }));
    const codes = m.verificar("ana", addDays(WS, 7), "S1").soft.map((w) => w.code);
    expect(codes).toContain("DIAS_SEGUIDOS");
    const h = new Motor(base({ turnos: turnos.slice(0, 5) })).verificar("ana", addDays(WS, 5), "S1").soft.map((w) => w.code);
    expect(h).toContain("HORAS");
  });

  it("validarLote exige justificação para exceções e regista os códigos", () => {
    const m = new Motor(base({ turnos: [turno("rui", WS, "S8")] }));
    const semJust = m.validarLote([], [{ data: addDays(WS, 1), slotId: "S1", pessoaId: "rui" }]);
    expect(semJust.ok).toBe(false);
    const comJust = m.validarLote([], [{ data: addDays(WS, 1), slotId: "S1", pessoaId: "rui", justificacao: "Cobertura" }]);
    expect(comJust.ok).toBe(true);
    expect(comJust.atribuir[0].excecaoRegras).toEqual(["DESCANSO"]);
  });

  it("validarLote considera as remoções e atribuições anteriores do mesmo lote", () => {
    const m = new Motor(base({ turnos: [turno("rui", WS, "S8")] }));
    const r = m.validarLote([{ data: WS, pessoaId: "rui" }], [{ data: addDays(WS, 1), slotId: "S1", pessoaId: "rui" }]);
    expect(r.ok).toBe(true);
    expect(r.atribuir[0].excecaoRegras).toEqual([]);
  });
});

describe("necessidades e feriados", () => {
  it("necessidade do dia sobrepõe-se ao padrão; feriado pode usar a de fim de semana", () => {
    const ds = base({
      necessidadesDia: [{ data: WS, grupoId: "RED", slotId: "S1", minimo: 2, maximo: 3 }],
      necessidades: [
        { grupoId: "RED", slotId: "S1", tipoDia: "SEMANA", minimo: 1, maximo: 1 },
        { grupoId: "RED", slotId: "S5", tipoDia: "FDS", minimo: 1, maximo: 1 },
      ],
      feriados: [{ data: addDays(WS, 1), nome: "Teste", ambito: "NACIONAL" }],
    });
    const m = new Motor(ds);
    expect(m.demanda("RED", WS, "S1")).toEqual([2, 3]);
    expect(m.demanda("RED", addDays(WS, 1), "S5")).toEqual([0, 0]);
    const m2 = new Motor({ ...ds, regras: { ...ds.regras, feriadoComoFds: true } });
    expect(m2.demanda("RED", addDays(WS, 1), "S5")).toEqual([1, 1]);
  });

  it("férias contam só dias úteis (sem fins de semana nem feriados)", () => {
    const m = new Motor(
      base({
        ausencias: [ausencia("ana", WS, addDays(WS, 6))],
        feriados: [{ data: addDays(WS, 2), nome: "Teste", ambito: "NACIONAL" }],
      })
    );
    expect(m.feriasUsadas("ana", "2027")).toBe(4);
    expect(m.feriasSaldo("ana", "2027")).toBe(22);
  });
});

describe("compensações", () => {
  it("fim de semana trabalhado gera 2 folgas devidas, cobertas por dias úteis livres", () => {
    const sab = addDays(WS, 5);
    const turnos = [turno("rui", sab, "S1"), ...dRange(addDays(WS, 7), addDays(WS, 11)).map((d) => turno("rui", d, "S1"))];
    const m = new Motor(base({ turnos }));
    const lg = m.saldoCompensacao("rui", WS, addDays(WS, 13));
    expect(lg.dev).toBe(2);
    expect(lg.got).toBe(2);
    expect(lg.obl[0].dias.every((d) => d < sab)).toBe(true);
  });
});

describe("sugestão", () => {
  it("cobre o mínimo da semana sem violar regras rígidas", () => {
    const m = new Motor(base({ ausencias: [ausencia("ana", WS, addDays(WS, 1))] }));
    const { props, gaps } = m.sugerir(WS, "RED");
    expect(gaps).toEqual([]);
    expect(props).toHaveLength(7);
    for (const p of props) expect(m.hardOf(p.pessoaId, p.data, p.slotId)).toEqual([]);
    expect(props.filter((p) => p.data <= addDays(WS, 1)).every((p) => p.pessoaId === "rui")).toBe(true);
  });

  it("reporta lacunas quando ninguém tem o período", () => {
    const m = new Motor(base({ necessidades: [{ grupoId: "RED", slotId: "S5", tipoDia: "SEMANA", minimo: 1, maximo: 1 }], pessoas: [pessoa("ana", "RED", ["M"])] }));
    const { props, gaps } = m.sugerir(WS, "RED");
    expect(props).toHaveLength(0);
    expect(gaps).toHaveLength(5);
    expect(gaps[0].motivo).toMatch(/ninguém/);
  });
});

describe("mínimo por período", () => {
  it("conta quem integra o grupo à semana e não se aplica ao fim de semana", () => {
    const ds = base({
      grupos: [
        { id: "RED", nome: "Redação", ordem: 1, estimado: false, ativo: true, minimos: { M: 2 } },
        { id: "COO", nome: "Coord", ordem: 2, estimado: false, ativo: true, minimos: {} },
      ],
      pessoas: [pessoa("ana", "RED", ["M"]), pessoa("sofia", "COO", ["M"], { integraGrupoId: "RED" })],
      turnos: [turno("ana", WS, "S1"), turno("sofia", WS, "S1", "COO")],
    });
    const m = new Motor(ds);
    expect(m.verificarPeriodo("RED", WS)?.ok).toBe(true);
    expect(m.verificarPeriodo("RED", addDays(WS, 5))?.na).toBe(true);
  });
});

describe("acesso por funcionalidade", () => {
  it("lê o app_metadata e restringe caminhos", () => {
    const a = acessoDeMetadata({ features: ["escalas"], gmc_role: "user", must_change_password: true });
    expect(a.mustChangePassword).toBe(true);
    expect(podeUsar(a, "escalas")).toBe(true);
    expect(podeUsar(a, "agentes")).toBe(false);
    expect(homeDoUtilizador(a)).toBe("/escalas");
    expect(featureDoCaminho("/")).toBe("agentes");
    expect(featureDoCaminho("/api/escalas/turnos")).toBe("escalas");
    expect(featureDoCaminho("/escalasx")).toBe(null);
    expect(featureDoCaminho("/admin")).toBe(null);
  });

  it("sem restrições ou admin vê tudo", () => {
    expect(podeUsar(acessoDeMetadata({}), "clips")).toBe(true);
    expect(podeUsar(acessoDeMetadata({ features: [], gmc_role: "admin" }), "clips")).toBe(true);
    expect(homeDoUtilizador(acessoDeMetadata({ features: [] }))).toBe("/conta/sem-acesso");
  });
});
