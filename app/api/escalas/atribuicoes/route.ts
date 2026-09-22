import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { commitAssignment, metadadosExcecao } from "@lib/escalas/commit";
import { weekEnd, weekStart } from "@lib/escalas/dates";
import { atribuicaoSchema, jsonError, readJson, requireEscala, respostaDb } from "@lib/escalas/http";
import { deleteAssignment, loadEstado, saveAssignment } from "@lib/escalas/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireEscala(true);
  if ("error" in auth && auth.error) return auth.error;
  const body = await readJson(req, atribuicaoSchema);
  if (body instanceof NextResponse) return body;

  try {
    const { estado, settings } = await loadEstado(auth.supabase, weekStart(body.date), weekEnd(body.date));
    const existente = estado.atribuicoes.find((a) => a.userId === body.userId && a.date === body.date);
    const resultado = commitAssignment(estado, {
      userId: body.userId,
      date: body.date,
      shiftCode: body.shiftCode,
      override: body.override,
      justificacao: body.justificacao,
      actorId: auth.user.id,
      existenteId: body.substituir ? existente?.id : undefined,
    }, settings);

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, hard: resultado.hard, warnings: resultado.warnings, error: resultado.error },
        { status: resultado.status }
      );
    }

    await saveAssignment(auth.supabase, resultado.assignment, auth.user.id);
    await logAudit(auth.supabase, {
      actorId: auth.user.id,
      action: resultado.assignment.excecao ? "escala.assignment.exception" : "escala.assignment.create",
      entityType: "escala_assignments",
      entityId: resultado.assignment.id,
      metadata: resultado.assignment.excecao
        ? metadadosExcecao(resultado.assignment)
        : {
            userId: resultado.assignment.userId,
            date: resultado.assignment.date,
            turno: resultado.assignment.shiftCode,
            excecao: false,
          },
    });
    return NextResponse.json({ ok: true, assignment: resultado.assignment, warnings: resultado.warnings });
  } catch (error) {
    return respostaDb(error);
  }
}

export async function DELETE(req: Request) {
  const auth = await requireEscala(true);
  if ("error" in auth && auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id em falta", 422);
  try {
    await deleteAssignment(auth.supabase, id);
    await logAudit(auth.supabase, {
      actorId: auth.user.id,
      action: "escala.assignment.delete",
      entityType: "escala_assignments",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDb(error);
  }
}
