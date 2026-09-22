import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { ausenciaSchema, jsonError, readJson, requireEscala, respostaDb } from "@lib/escalas/http";
import { deleteAusencia, loadEstado, saveAusencia } from "@lib/escalas/repo";
import { weekEnd, weekStart } from "@lib/escalas/dates";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireEscala(true);
  if ("error" in auth && auth.error) return auth.error;
  const body = await readJson(req, ausenciaSchema);
  if (body instanceof NextResponse) return body;
  try {
    const { estado } = await loadEstado(auth.supabase, weekStart(body.date), weekEnd(body.date));
    const turno = estado.atribuicoes.find((a) => a.userId === body.userId && a.date === body.date);
    if (turno) {
      return jsonError("Retira o turno antes de marcar férias ou ausência.", 422);
    }
    await saveAusencia(auth.supabase, { ...body, actorId: auth.user.id });
    await logAudit(auth.supabase, {
      actorId: auth.user.id,
      action: "escala.absence.approve",
      entityType: "escala_ausencias",
      metadata: { userId: body.userId, date: body.date, tipo: body.tipo, estado: "aprovada" },
    });
    return NextResponse.json({ ok: true });
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
    await deleteAusencia(auth.supabase, id);
    await logAudit(auth.supabase, {
      actorId: auth.user.id,
      action: "escala.absence.delete",
      entityType: "escala_ausencias",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDb(error);
  }
}
