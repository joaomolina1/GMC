import { NextResponse } from "next/server";
import { addDays, todayInLisbon, weekStart } from "@lib/escalas/dates";
import { dateSchema, jsonError, requireEscala, respostaDb } from "@lib/escalas/http";
import { loadQuadro } from "@lib/escalas/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireEscala(false);
  if ("error" in auth && auth.error) return auth.error;
  const url = new URL(req.url);
  const raw = url.searchParams.get("from");
  const from = raw && dateSchema.safeParse(raw).success ? weekStart(raw) : weekStart(todayInLisbon());
  try {
    const quadro = await loadQuadro(
      auth.supabase,
      from,
      addDays(from, 6),
      { userId: auth.user.id, nome: auth.nome, email: auth.email },
      auth.podeGerir
    );
    return NextResponse.json(quadro);
  } catch (error) {
    return respostaDb(error);
  }
}

export async function OPTIONS() {
  return jsonError("Method not allowed", 405);
}
