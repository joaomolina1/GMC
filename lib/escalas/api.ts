import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { obterSessao } from "./sessao";
import { podeAdministrar, podeCoordenar, type Sessao } from "./tipos";

type Nivel = "membro" | "coord" | "admin";

/** Autentica um pedido de API das Escalas e exige um nível mínimo. */
export async function exigir(nivel: Nivel) {
  const sessao = await obterSessao();
  if (!sessao) return { erro: NextResponse.json({ error: "Sem acesso às Escalas." }, { status: 403 }) } as const;
  if (nivel === "coord" && !podeCoordenar(sessao.papel))
    return { erro: NextResponse.json({ error: "Reservado à coordenação." }, { status: 403 }) } as const;
  if (nivel === "admin" && !podeAdministrar(sessao.papel))
    return { erro: NextResponse.json({ error: "Reservado à administração." }, { status: 403 }) } as const;
  const sb = await createClient();
  return { sessao: sessao as Sessao, sb } as const;
}

export const erro = (msg: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: msg, ...extra }, { status });
