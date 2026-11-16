import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigir } from "@lib/escalas/api";
import { carregarDataset, mensagemErro } from "@lib/escalas/dados";
import { addDays } from "@lib/escalas/datas";
import { Motor } from "@lib/escalas/motor";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  retirar: z.array(z.object({ data, pessoaId: z.string().uuid() })).max(2000).default([]),
  atribuir: z
    .array(
      z.object({
        data,
        slotId: z.string().min(1).max(12),
        pessoaId: z.string().uuid(),
        origem: z.enum(["MANUAL", "SUGESTAO", "COPIA", "MASSA", "IMPORTACAO"]).optional(),
        justificacao: z.string().max(1000).optional(),
      })
    )
    .max(2000)
    .default([]),
  registo: z.object({ acao: z.string().min(1).max(120), detalhe: z.string().max(5000) }).optional(),
  /** Grava o que for válido e devolve os restantes como erros (importação). */
  parcial: z.boolean().optional(),
});

/**
 * Aplica um lote de atribuições/remoções. O motor revalida tudo no servidor:
 * regras rígidas bloqueiam; regras flexíveis exigem justificação e ficam registadas como exceção.
 * A gravação é atómica (RPC escala_aplicar_turnos).
 */
export async function POST(req: Request) {
  const auth = await exigir("coord");
  if ("erro" in auth) return auth.erro;
  const { sb } = auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return erro("Pedido inválido.", 400, { detalhes: parsed.error.flatten() });
  const { retirar, atribuir, registo, parcial } = parsed.data;
  if (!retirar.length && !atribuir.length) return NextResponse.json({ ok: true, n: 0 });

  const datas = [...retirar.map((r) => r.data), ...atribuir.map((a) => a.data)].sort();
  const from = addDays(datas[0], -70);
  const to = addDays(datas[datas.length - 1], 21);

  let motor: Motor;
  try {
    motor = new Motor(await carregarDataset(sb, from, to));
  } catch (e) {
    return erro(mensagemErro(e), 500);
  }

  const v = motor.validarLote(retirar, atribuir);
  const nome = (id: string) => motor.pessoa(id)?.nome ?? id;
  const erros = v.erros.map((e) => ({ ...e, nome: nome(e.pessoaId), etiqueta: e.slotId ? motor.slot(e.slotId)?.etiqueta : undefined }));
  if (!v.ok && !parcial) {
    return erro("Algumas atribuições não respeitam as regras.", 409, { erros });
  }

  const { data: n, error } = await sb.rpc("escala_aplicar_turnos", {
    p_retirar: v.retirar.map((r) => ({ data: r.data, pessoa_id: r.pessoaId })),
    p_atribuir: v.atribuir.map((a) => ({
      data: a.data,
      slot_id: a.slotId,
      pessoa_id: a.pessoaId,
      origem: a.origem ?? "MANUAL",
      excecao_regras: a.excecaoRegras,
      justificacao: a.justificacao ?? "",
    })),
  });
  if (error) return erro(mensagemErro(error), 409);

  if (registo) {
    await sb.from("escala_registo").insert({
      acao: registo.acao,
      detalhe: registo.detalhe,
      dados: { retirados: v.retirar.length, atribuidos: v.atribuir.length, excecoes: v.atribuir.filter((a) => a.excecaoRegras.length).length },
      user_id: auth.sessao.userId,
    });
  }
  return NextResponse.json({ ok: true, n, excecoes: v.atribuir.filter((a) => a.excecaoRegras.length).length, erros });
}
