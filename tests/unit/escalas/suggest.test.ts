import { describe, expect, it } from "vitest";
import { addDays } from "@lib/escalas/dates";
import { avaliarAtribuicao } from "@lib/escalas/constraints";
import { DEFAULT_SETTINGS } from "@lib/escalas/settings";
import { atribuicoesAConfirmar, sugerirEscala } from "@lib/escalas/suggest";
import { TURNOS } from "@lib/escalas/turnos";
import type { Atribuicao, Ausencia, EscalaSettings, EstadoEscala, Membro } from "@lib/escalas/types";

function membro(userId: string, nome: string, turnos: string[]): Membro {
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
    id: `${userId}-${date}`,
    userId,
    date,
    shiftCode,
    excecao: false,
    excecao_codigos: [],
    excecao_justificacao: null,
    excecao_autorizada_por: null,
  };
}

function dias(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function base(membros: Membro[], atribuicoes: Atribuicao[] = [], ausencias: Ausencia[] = []): EstadoEscala {
  return { membros, atribuicoes, ausencias, turnos: TURNOS };
}

describe("10. motor de sugestão", () => {
  it("com folga de candidatos não produz avisos SOFT", () => {
    const estado = base([
      membro("ana", "Ana", ["S1"]),
      membro("bruno", "Bruno", ["S1"]),
      membro("carla", "Carla", ["S1"]),
    ]);
    const resultado = sugerirEscala(estado, [{ date: "2026-10-12", shiftCode: "S1", quantidade: 1 }], DEFAULT_SETTINGS);
    expect(resultado.porPreencher).toEqual([]);
    expect(resultado.bloqueios).toEqual([]);
    expect(resultado.atribuicoes).toHaveLength(1);
    expect(resultado.atribuicoes[0].excecao).toBe(false);
    expect(resultado.atribuicoes[0].warnings).toEqual([]);
  });

  it("com escassez marca exceção em vez de deixar o lugar vazio, e nunca viola HARD", () => {
    const unico = membro("bruno", "Bruno", ["S3"]);
    const estado = base(
      [unico],
      dias("2026-10-01", "2026-10-07").map((date) => atrib("bruno", date, "S3"))
    );
    const resultado = sugerirEscala(estado, [{ date: "2026-10-08", shiftCode: "S3", quantidade: 1 }], DEFAULT_SETTINGS);
    expect(resultado.porPreencher).toEqual([]);
    expect(resultado.atribuicoes).toHaveLength(1);
    expect(resultado.atribuicoes[0].excecao).toBe(true);
    expect(resultado.atribuicoes[0].warnings.map((w) => w.code)).toContain("MAX_DIAS_CONSECUTIVOS");

    for (const proposta of resultado.atribuicoes) {
      const outraVez = avaliarAtribuicao(estado, proposta, DEFAULT_SETTINGS);
      expect(outraVez.hard).toEqual([]);
    }
  });

  it("não propõe quem está de férias, fora do perfil ou já escalado nesse dia", () => {
    const estado = base(
      [membro("eva", "Eva", ["S1"])],
      [atrib("eva", "2026-10-12", "S1")],
      [{ id: "f", userId: "eva", date: "2026-10-13", tipo: "ferias", estado: "aprovada" }]
    );
    const ferias = sugerirEscala(estado, [{ date: "2026-10-13", shiftCode: "S1", quantidade: 1 }], DEFAULT_SETTINGS);
    expect(ferias.atribuicoes).toEqual([]);
    expect(ferias.porPreencher).toEqual([{ date: "2026-10-13", shiftCode: "S1" }]);
    expect(ferias.bloqueios.map((b) => b.code)).toContain("AUSENCIA_APROVADA");

    const duplicado = sugerirEscala(estado, [{ date: "2026-10-12", shiftCode: "S2", quantidade: 1 }], DEFAULT_SETTINGS);
    expect(duplicado.atribuicoes).toEqual([]);
    expect(duplicado.bloqueios.map((b) => b.code)).toContain("TURNO_DUPLICADO");

    const perfil = sugerirEscala(
      base([membro("ana", "Ana", ["S1"])]),
      [{ date: "2026-10-12", shiftCode: "S6", quantidade: 1 }],
      DEFAULT_SETTINGS
    );
    expect(perfil.atribuicoes).toEqual([]);
    expect(perfil.bloqueios.map((b) => b.code)).toContain("FORA_DO_PERFIL");
  });

  it("prefere folgas regulares e só agrupa quando a redação o pede", () => {
    const membros = [membro("ana", "Ana", ["S1"]), membro("bruno", "Bruno", ["S1"])];
    const estado = base(
      membros,
      dias("2026-10-01", "2026-10-06").map((date) => atrib("ana", date, "S1"))
    );
    const espalhado = sugerirEscala(estado, [{ date: "2026-10-07", shiftCode: "S1", quantidade: 1 }], DEFAULT_SETTINGS);
    expect(espalhado.atribuicoes[0].userId).toBe("bruno");
    expect(espalhado.atribuicoes[0].excecao).toBe(false);

    const agrupadas: EscalaSettings = { ...DEFAULT_SETTINGS, preferirFolgasAgrupadas: true };
    const bloco = sugerirEscala(estado, [{ date: "2026-10-07", shiftCode: "S1", quantidade: 1 }], agrupadas);
    expect(bloco.atribuicoes[0].userId).toBe("ana");
    expect(bloco.atribuicoes[0].excecao).toBe(false);
  });

  it("mesmo a preferir blocos, não escolhe uma exceção se houver candidato limpo", () => {
    const estado = base(
      [membro("ana", "Ana", ["S1"]), membro("bruno", "Bruno", ["S1"])],
      dias("2026-10-01", "2026-10-07").map((date) => atrib("ana", date))
    );
    const settings: EscalaSettings = { ...DEFAULT_SETTINGS, preferirFolgasAgrupadas: true };
    const resultado = sugerirEscala(estado, [{ date: "2026-10-08", shiftCode: "S1", quantidade: 1 }], settings);
    expect(resultado.atribuicoes[0].userId).toBe("bruno");
    expect(resultado.atribuicoes[0].excecao).toBe(false);
  });

  it("a pré-visualização em massa pode excluir os avisos", () => {
    const items = [
      { userId: "a", excecao: false },
      { userId: "b", excecao: true },
    ];
    expect(atribuicoesAConfirmar(items, false).map((i) => i.userId)).toEqual(["a", "b"]);
    expect(atribuicoesAConfirmar(items, true).map((i) => i.userId)).toEqual(["a"]);
  });
});
