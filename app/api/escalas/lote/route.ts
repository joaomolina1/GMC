import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { commitAssignment, metadadosExcecao } from "@lib/escalas/commit";
import { loteSchema, readJson, requireEscala, respostaDb } from "@lib/escalas/http";
import { loadEstado, saveAssignment } from "@lib/escalas/repo";
import type { Atribuicao, EstadoEscala } from "@lib/escalas/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireEscala(true);
  if ("error" in auth && auth.error) return auth.error;
  const body = await readJson(req, loteSchema);
  if (body instanceof NextResponse) return body;

  const datas = body.atribuicoes.map((a) => a.date).sort();
  try {
    const loaded = await loadEstado(auth.supabase, datas[0], datas[datas.length - 1]);
    let working: EstadoEscala = loaded.estado;
    const gravar: Atribuicao[] = [];
    const problemas: { userId: string; date: string; shiftCode: string; status: number; error?: string; hard: unknown[]; warnings: unknown[] }[] = [];

    for (const item of body.atribuicoes) {
      const resultado = commitAssignment(working, {
        ...item,
        override: true,
        justificacao: body.justificacao,
        actorId: auth.user.id,
      }, loaded.settings);
      if (!resultado.ok) {
        problemas.push({
          userId: item.userId,
          date: item.date,
          shiftCode: item.shiftCode,
          status: resultado.status,
          error: resultado.error,
          hard: resultado.hard,
          warnings: resultado.warnings,
        });
        continue;
      }
      gravar.push(resultado.assignment);
      working = {
        ...working,
        atribuicoes: [
          ...working.atribuicoes.filter((a) => a.id !== resultado.assignment.id),
          resultado.assignment,
        ],
      };
    }

    if (problemas.length > 0) {
      return NextResponse.json({ ok: false, problemas, gravadas: [] }, { status: 422 });
    }

    for (const assignment of gravar) {
      await saveAssignment(auth.supabase, assignment, auth.user.id);
      await logAudit(auth.supabase, {
        actorId: auth.user.id,
        action: assignment.excecao ? "escala.assignment.exception" : "escala.assignment.create",
        entityType: "escala_assignments",
        entityId: assignment.id,
        metadata: assignment.excecao
          ? metadadosExcecao(assignment)
          : { userId: assignment.userId, date: assignment.date, turno: assignment.shiftCode, excecao: false },
      });
    }
    return NextResponse.json({ ok: true, gravadas: gravar });
  } catch (error) {
    return respostaDb(error);
  }
}
