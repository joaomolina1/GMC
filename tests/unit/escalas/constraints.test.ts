import { describe, expect, it } from "vitest";
import { commitAssignment, metadadosExcecao } from "@lib/escalas/commit";
import { conformidadeDe } from "@lib/escalas/compliance";
import { buildDemo, DEMO_EQUIPA } from "@lib/escalas/demo";
import {
  avaliarAtribuicao,
  diaDeTrabalho,
  diasConsecutivosAte,
  diasDeTrabalho,
  folgasNaJanela,
  horasNaSemana,
  isFolga,
} from "@lib/escalas/constraints";
import { addDays } from "@lib/escalas/dates";
import { DEFAULT_SETTINGS } from "@lib/escalas/settings";
import { duracaoRelogioHoras, horasContadas, turnoByCode, TURNOS } from "@lib/escalas/turnos";
import type { Atribuicao, Ausencia, EstadoEscala, Membro } from "@lib/escalas/types";

function membro(userId: string, turnos: string[], nome = userId): Membro {
  return {
    userId,
    nome,
    email: `${userId}@escalas.gmc.pt`,
    papel: "jornalista",
    turnosPermitidos: turnos,
    ativo: true,
  };
}

function atrib(userId: string, date: string, shiftCode = "S1"): Atribuicao {
  return {
    id: `${userId}-${date}-${shiftCode}`,
    userId,
    date,
    shiftCode,
    excecao: false,
    excecao_codigos: [],
    excecao_justificacao: null,
    excecao_autorizada_por: null,
  };
}

function estado(parcial: Partial<EstadoEscala> & { membros: Membro[] }): EstadoEscala {
  return {
    atribuicoes: [],
    ausencias: [],
    turnos: TURNOS,
    ...parcial,
  };
}

function dias(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

describe("8. 8.º dia consecutivo", () => {
  const userId = "jornalista";
  const base = estado({
    membros: [membro(userId, ["S1", "S3"], "Bruno")],
    atribuicoes: dias("2026-10-01", "2026-10-07").map((date) => atrib(userId, date, "S1")),
  });

  it("devolve o aviso SOFT e só grava com override e justificação não vazia", () => {
    const pedido = { userId, date: "2026-10-08", shiftCode: "S1", actorId: "coordenador" };
    const semOverride = commitAssignment(base, pedido, DEFAULT_SETTINGS);
    expect(semOverride.ok).toBe(false);
    if (semOverride.ok) return;
    expect(semOverride.status).toBe(409);
    expect(semOverride.warnings.map((w) => w.code)).toEqual(["MAX_DIAS_CONSECUTIVOS"]);
    expect(semOverride.warnings[0].message).toBe("8.º dia consecutivo de trabalho");
    expect(semOverride.warnings[0].severity).toBe("SOFT");
    expect(base.atribuicoes).toHaveLength(7);

    const vazia = commitAssignment(base, { ...pedido, override: true, justificacao: "   " }, DEFAULT_SETTINGS);
    expect(vazia.ok).toBe(false);
    if (!vazia.ok) expect(vazia.status).toBe(422);
    expect(base.atribuicoes).toHaveLength(7);

    const gravada = commitAssignment(
      base,
      { ...pedido, override: true, justificacao: "Cobertura de última hora" },
      DEFAULT_SETTINGS
    );
    expect(gravada.ok).toBe(true);
    if (!gravada.ok) return;
    expect(gravada.assignment.excecao).toBe(true);
    expect(gravada.assignment.excecao_codigos).toEqual(["MAX_DIAS_CONSECUTIVOS"]);
    expect(gravada.assignment.excecao_justificacao).toBe("Cobertura de última hora");
    expect(gravada.assignment.excecao_autorizada_por).toBe("coordenador");
  });
});

describe("9. folgas em janela deslizante", () => {
  const userId = "diogo";

  function trabalhoOutubro(): Set<string> {
    const work = new Set<string>();
    for (const date of dias("2026-10-04", "2026-10-11")) work.add(date);
    for (const date of dias("2026-10-15", "2026-10-24")) work.add(date);
    return work;
  }

  function folgasDeQuinzena(which: 1 | 2, work: Set<string>): number {
    const start = which === 1 ? 1 : 15;
    const end = which === 1 ? 14 : 28;
    let n = 0;
    for (let day = start; day <= end; day += 1) {
      const iso = `2026-10-${String(day).padStart(2, "0")}`;
      if (!work.has(iso)) n += 1;
    }
    return n;
  }

  it("avisa ao ocupar uma folga da janela deslizante mesmo com as quinzenas de calendário ainda legais", () => {
    const antes = trabalhoOutubro();
    // Três folgas dentro de 8–21 (12, 13 e 14). As quinzenas 1–14 e 15–28 têm pelo menos quatro.
    expect(folgasNaJanela("2026-10-21", 14, antes, new Set())).toBe(3);
    expect(folgasDeQuinzena(1, antes)).toBeGreaterThanOrEqual(4);
    expect(folgasDeQuinzena(2, antes)).toBeGreaterThanOrEqual(4);

    const base = estado({
      membros: [membro(userId, ["S1"], "Diogo")],
      atribuicoes: [...antes].map((date) => atrib(userId, date)),
    });
    const resultado = avaliarAtribuicao(
      base,
      { userId, date: "2026-10-12", shiftCode: "S1" },
      DEFAULT_SETTINGS
    );
    expect(resultado.hard).toEqual([]);
    const aviso = resultado.warnings.find((w) => w.code === "FOLGAS_INSUFICIENTES");
    expect(aviso).toBeTruthy();
    const match = aviso?.detail.match(/apenas (\d+) folgas entre (\d{2}\/\d{2}) e (\d{2}\/\d{2})/);
    expect(match).toBeTruthy();
    const [, countRaw, startPt, endPt] = match!;
    const start = `2026-${startPt.slice(3, 5)}-${startPt.slice(0, 2)}`;
    const end = `2026-${endPt.slice(3, 5)}-${endPt.slice(0, 2)}`;
    expect(end >= "2026-10-12" && start <= "2026-10-12").toBe(true);
    expect(dias(start, end)).toHaveLength(14);
    expect(`${startPt}–${endPt}`).not.toBe("01/10–14/10");
    expect(`${startPt}–${endPt}`).not.toBe("15/10–28/10");

    const depois = new Set(antes);
    depois.add("2026-10-12");
    expect(folgasNaJanela(end, 14, depois, new Set())).toBe(Number(countRaw));
    expect(Number(countRaw)).toBeLessThan(4);
    expect(folgasDeQuinzena(1, depois)).toBeGreaterThanOrEqual(4);
    expect(folgasDeQuinzena(2, depois)).toBeGreaterThanOrEqual(4);
    // A janela ao lado não é a mesma contagem: desliza um dia.
    expect(folgasNaJanela("2026-10-21", 14, depois, new Set())).not.toBe(
      folgasNaJanela("2026-10-25", 14, depois, new Set())
    );
  });

  it("não trata férias aprovadas como folga", () => {
    const ferias = dias("2026-10-11", "2026-10-14");
    const trabalho = new Set(dias("2026-10-01", "2026-10-10"));
    const afastamentos = new Set(ferias);
    expect(folgasNaJanela("2026-10-14", 14, trabalho, afastamentos)).toBe(0);
    expect(folgasNaJanela("2026-10-14", 14, trabalho, new Set())).toBe(4);

    const base = estado({
      membros: [membro(userId, ["S1"])],
      atribuicoes: [...trabalho].map((date) => atrib(userId, date)),
      ausencias: ferias.map(
        (date): Ausencia => ({ id: date, userId, date, tipo: "ferias", estado: "aprovada" })
      ),
    });
    const bloqueio = avaliarAtribuicao(base, { userId, date: "2026-10-12", shiftCode: "S1" }, DEFAULT_SETTINGS);
    expect(bloqueio.hard.map((h) => h.code)).toContain("AUSENCIA_APROVADA");
    expect(bloqueio.warnings).toEqual([]);
  });
});

describe("11. exceção no audit_log", () => {
  it("grava justificação, autor e códigos", () => {
    const userId = "jornalista";
    const base = estado({
      membros: [membro(userId, ["S1"])],
      atribuicoes: dias("2026-10-01", "2026-10-07").map((date) => atrib(userId, date)),
    });
    const entradas: unknown[] = [];
    const resultado = commitAssignment(
      base,
      {
        userId,
        date: "2026-10-08",
        shiftCode: "S1",
        actorId: "coordenador-rita",
        override: true,
        justificacao: "Direto prolongado",
      },
      DEFAULT_SETTINGS,
      (entry) => entradas.push(entry)
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(entradas).toHaveLength(1);
    const entry = entradas[0] as {
      actorId: string;
      action: string;
      entityType: string;
      metadata: Record<string, unknown>;
    };
    expect(entry.actorId).toBe("coordenador-rita");
    expect(entry.action).toBe("escala.assignment.exception");
    expect(entry.entityType).toBe("escala_assignments");
    expect(entry.metadata).toEqual(metadadosExcecao(resultado.assignment));
    expect(entry.metadata.excecao_justificacao).toBe("Direto prolongado");
    expect(entry.metadata.excecao_autorizada_por).toBe("coordenador-rita");
    expect(entry.metadata.excecao_codigos).toEqual(["MAX_DIAS_CONSECUTIVOS"]);
  });
});

describe("12. o S6 conta só no dia em que começa", () => {
  it("o turno do dia 10 que termina às 02:00 do dia 11 é trabalho do dia 10", () => {
    const atribuicoes = [
      ...dias("2026-10-04", "2026-10-09").map((date) => atrib("carla", date, "S5")),
      atrib("carla", "2026-10-10", "S6"),
    ];
    const trabalho = diasDeTrabalho(atribuicoes.map((a) => ({ date: diaDeTrabalho(a) })));
    expect(trabalho.has("2026-10-10")).toBe(true);
    expect(trabalho.has("2026-10-11")).toBe(false);
    expect(diasConsecutivosAte(trabalho, "2026-10-10")).toBe(7);
    expect(diasConsecutivosAte(trabalho, "2026-10-11")).toBe(0);
    expect(isFolga("2026-10-11", trabalho, new Set())).toBe(true);

    const s6 = turnoByCode("S6")!;
    expect(duracaoRelogioHoras(s6)).toBe(9);
    expect(horasContadas(DEFAULT_SETTINGS)).toBe(7);
    const semana = dias("2026-10-05", "2026-10-09");
    expect(horasNaSemana(semana, "2026-10-07", DEFAULT_SETTINGS)).toBe(35);
    expect(horasNaSemana(semana, "2026-10-07", DEFAULT_SETTINGS)).not.toBe(45);
  });

  it("avisar descanso usa a hora a que o S6 acaba, no dia seguinte", () => {
    const base = estado({
      membros: [membro("carla", ["S1", "S5", "S6"], "Carla")],
      atribuicoes: [atrib("carla", "2026-10-10", "S6")],
    });
    const cedo = avaliarAtribuicao(base, { userId: "carla", date: "2026-10-11", shiftCode: "S1" }, DEFAULT_SETTINGS);
    expect(cedo.warnings.map((w) => w.code)).toContain("DESCANSO_INSUFICIENTE");
    expect(cedo.warnings.find((w) => w.code === "DESCANSO_INSUFICIENTE")?.detail).toContain("5h");

    const tarde = avaliarAtribuicao(base, { userId: "carla", date: "2026-10-11", shiftCode: "S5" }, DEFAULT_SETTINGS);
    expect(tarde.warnings.map((w) => w.code)).not.toContain("DESCANSO_INSUFICIENTE");
  });
});

describe("regras HARD", () => {
  it("recusa perfil, férias aprovadas e segundo turno no mesmo dia", () => {
    const base = estado({
      membros: [membro("ana", ["S1"], "Ana")],
      atribuicoes: [atrib("ana", "2026-10-10", "S1")],
      ausencias: [{ id: "f", userId: "ana", date: "2026-10-12", tipo: "ferias", estado: "aprovada" }],
    });
    expect(
      avaliarAtribuicao(base, { userId: "ana", date: "2026-10-11", shiftCode: "S6" }, DEFAULT_SETTINGS).hard.map(
        (h) => h.code
      )
    ).toContain("FORA_DO_PERFIL");
    expect(
      avaliarAtribuicao(base, { userId: "ana", date: "2026-10-12", shiftCode: "S1" }, DEFAULT_SETTINGS).hard.map(
        (h) => h.code
      )
    ).toContain("AUSENCIA_APROVADA");
    expect(
      avaliarAtribuicao(base, { userId: "ana", date: "2026-10-10", shiftCode: "S1" }, DEFAULT_SETTINGS).hard.map(
        (h) => h.code
      )
    ).toContain("TURNO_DUPLICADO");

    const pendente = estado({
      membros: [membro("ana", ["S1"])],
      ausencias: [{ id: "p", userId: "ana", date: "2026-10-11", tipo: "ausencia", estado: "pendente" }],
    });
    expect(avaliarAtribuicao(pendente, { userId: "ana", date: "2026-10-11", shiftCode: "S1" }, DEFAULT_SETTINGS).hard).toEqual(
      []
    );
  });
});

describe("semana de exemplo", () => {
  const demo = buildDemo();
  const bruno = DEMO_EQUIPA.find((p) => p.nome === "Bruno Oliveira")!;
  const diogo = DEMO_EQUIPA.find((p) => p.nome === "Diogo Santos")!;
  const quadro = estado({
    membros: demo.membros,
    atribuicoes: demo.atribuicoes,
    ausencias: demo.ausencias,
  });

  it("o 8.º dia do Bruno, a 22/09, é só a sequência consecutiva", () => {
    const avaliacao = avaliarAtribuicao(
      quadro,
      { userId: bruno.userId, date: "2026-09-22", shiftCode: "S3" },
      DEFAULT_SETTINGS
    );
    expect(avaliacao.hard).toEqual([]);
    expect(avaliacao.warnings.map((w) => w.code)).toEqual(["MAX_DIAS_CONSECUTIVOS"]);
  });

  it("o Diogo entra no dia 22 com menos de 4 folgas, e as férias da Eva não contam", () => {
    const c = conformidadeDe(diogo.userId, quadro, DEFAULT_SETTINGS, "2026-09-22");
    expect(c.folgasUltimos14Dias).toBeLessThan(4);
    expect(c.abaixoDoNecessario).toBe(true);
    const eva = DEMO_EQUIPA.find((p) => p.nome === "Eva Martins")!;
    const dela = conformidadeDe(eva.userId, quadro, DEFAULT_SETTINGS, "2026-09-25");
    expect(dela.feriasUltimos14Dias).toBe(3);
    const trabalho = diasDeTrabalho(demo.atribuicoes.filter((a) => a.userId === eva.userId));
    expect(isFolga("2026-09-23", trabalho, new Set(demo.ausencias.filter((a) => a.userId === eva.userId).map((a) => a.date)))).toBe(
      false
    );
  });
});
